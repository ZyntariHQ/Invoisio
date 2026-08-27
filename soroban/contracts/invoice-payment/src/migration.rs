//! Storage schema migration utilities for rebuilding payment history indexes.
//!
//! This module provides the migration logic to rebuild payment history indexes
//! and counts for legacy data during storage upgrades. It ensures that
//! `payment_history()` returns complete results after upgrade without requiring
//! ad-hoc reads.
//!
//! ## Non-canonical existing identifiers
//!
//! `record_payment` rejects `invoice_id` / `settlement_ref` values that are
//! not in canonical form (see `storage::is_canonical_identifier`), but that
//! guard applies only to new writes. Deployments that recorded payments
//! before the guard existed may already hold non-conforming identifiers.
//! Every function in this module — `collect_all_payment_records`,
//! `rebuild_payment_history_index`, `migrate_settlement_refs`,
//! `migrate_schema_v2_to_v3`, and the schema migrations that call them —
//! reads those identifiers back through
//! `get_payment_log_entry` / `get_payment` and never re-validates their
//! format, so pre-existing non-canonical records migrate, rebuild, and
//! remain readable exactly like any other record. Only a *new*
//! `record_payment` call is held to the canonical-form rule.

use soroban_sdk::{Env, String, Vec};

use crate::errors::ContractError;
use crate::events;
use crate::storage::{
    append_payer_entry, backfill_allowlist_index, clear_payer_indexes, current_contract_meta,
    ensure_current_contract_meta, get_contract_meta, get_history_count, get_payment,
    get_payment_log_entry, get_settlement_ref_count, get_settlement_ref_owner,
    get_storage_schema_version, is_asset_allowed, is_settlement_ref_used, record_settlement_ref,
    set_contract_meta, set_history_count, set_settlement_ref_count, DataKey, PaymentRecord,
    STORAGE_SCHEMA_V1, STORAGE_SCHEMA_V2, STORAGE_SCHEMA_V3, STORAGE_SCHEMA_VERSION,
};

/// Rebuilds the payment history index from all stored payment records.
///
/// This function scans all payment records and rebuilds the `PaymentHistory`
/// index in order of their `timestamp` field (or insertion order for legacy
/// records that may not have timestamps).
///
/// # Idempotency
/// Safe to call multiple times - checks current history count first and only
/// rebuilds if the index is empty or incomplete.
///
/// # Returns
/// * `Ok(())` on successful rebuild
/// * `Err(ContractError::StorageSchemaTooOld)` if schema migration is required first
///
/// # Performance
/// This operation iterates over all payment records and may be O(n) in the
/// number of payments. For large deployments, consider calling this during
/// maintenance windows.
pub fn rebuild_payment_history_index(env: &Env) -> Result<(), ContractError> {
    // Ensure we're on a compatible schema version
    let current_schema = get_storage_schema_version(env);
    if current_schema != STORAGE_SCHEMA_VERSION {
        return Err(ContractError::StorageSchemaTooOld);
    }

    // Check if index already exists and is complete
    let existing_count = get_history_count(env);
    if existing_count > 0 {
        // Index already exists - verify it's complete by checking all records
        // are indexed. We'll scan all payment records and compare.
        if is_index_complete(env) {
            return Ok(());
        }
        // Index is incomplete - clear and rebuild
        clear_history_index(env);
    }

    // Collect all payment records from storage
    let records = collect_all_payment_records(env)?;

    // Sort records by timestamp (legacy records without timestamp go first)
    let sorted = sort_records_by_timestamp(env, records);

    // Write sorted records to history index
    write_history_index(env, sorted)?;

    // Update history count. Only emit when there was actually something to
    // rebuild — an empty rebuild (e.g. a fresh deployment with no payments
    // yet) is a no-op and shouldn't be reported as an index rebuild.
    let new_count = get_history_count(env);
    if new_count > 0 {
        events::emit_history_index_rebuilt(env, new_count);
    }

    Ok(())
}

/// Checks if the history index is complete.
///
/// When `PaymentCount` is tracked (the common case), the index is complete
/// only if it covers every payment and every entry it claims is actually
/// present. When `PaymentCount` is unset (e.g. history entries were seeded
/// directly, bypassing `record_payment()`), we fall back to verifying the
/// entries the index itself claims to have, since there's no independent
/// count to check against.
fn is_index_complete(env: &Env) -> bool {
    let history_count = get_history_count(env);
    let payment_count = get_payment_count(env);

    if payment_count == 0 {
        return history_count == 0 || history_entries_exist(env, history_count);
    }

    history_count == payment_count && history_entries_exist(env, history_count)
}

/// Verifies that a `PaymentHistory` entry exists for every index in `0..count`.
fn history_entries_exist(env: &Env, count: u32) -> bool {
    for i in 0..count {
        if !env.storage().persistent().has(&DataKey::PaymentHistory(i)) {
            return false;
        }
    }
    true
}

/// Gets the total number of payment records stored.
fn get_payment_count(env: &Env) -> u32 {
    // We can't enumerate all keys directly, so we use the PaymentCount
    // stored in instance storage. This is maintained by record_payment()
    // and should be accurate.
    env.storage()
        .instance()
        .get(&DataKey::PaymentCount)
        .unwrap_or(0u32)
}

/// Clears all history index entries.
fn clear_history_index(env: &Env) {
    let count = get_history_count(env);
    for i in 0..count {
        let key = DataKey::PaymentHistory(i);
        env.storage().persistent().remove(&key);
    }
    // Reset history count
    set_history_count(env, 0);
}

/// Clears the settlement-reference write-order enumeration log.
///
/// Only touches `SettlementRefLog` / `SettlementRefCount` — never the
/// primary `SettlementRef(ref) -> invoice_id` keys, which `record_settlement_ref`
/// overwrites in place regardless of what shape (or absence) preceded them.
fn clear_settlement_ref_log(env: &Env) {
    let count = get_settlement_ref_count(env);
    for i in 0..count {
        let key = DataKey::SettlementRefLog(i);
        env.storage().persistent().remove(&key);
    }
    set_settlement_ref_count(env, 0);
}

/// Collects all payment records from persistent storage.
///
/// Soroban has no key enumeration, so records are found via the `PaymentLog`
/// write-order index (invoice ID keyed by `PaymentCount` index), which is
/// maintained independently of `PaymentHistory` and therefore survives even
/// if the history index itself is cleared or corrupted. Each invoice ID is
/// then resolved through `get_payment()`, which transparently handles both
/// legacy V0 and current V1 storage keys.
fn collect_all_payment_records(env: &Env) -> Result<Vec<PaymentRecord>, ContractError> {
    let mut records: Vec<PaymentRecord> = Vec::new(env);

    let payment_count = get_payment_count(env);
    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                records.push_back(record);
            }
        }
    }

    Ok(records)
}

/// Sorts payment records by timestamp.
///
/// Legacy records (timestamp = 0 or older) are placed first to maintain
/// chronological order. Records with the same timestamp are ordered by
/// their insertion order (stable sort).
fn sort_records_by_timestamp(env: &Env, records: Vec<PaymentRecord>) -> Vec<PaymentRecord> {
    // Convert to a heap-allocated vector for sorting
    let mut sorted: alloc::vec::Vec<PaymentRecord> = records.iter().collect();

    // Sort by timestamp ascending, then by insertion order (stable)
    sorted.sort_by_key(|record| record.timestamp);

    // Convert back to Soroban Vec
    let mut result: Vec<PaymentRecord> = Vec::new(env);
    for record in sorted {
        result.push_back(record);
    }

    result
}

/// Writes the sorted records to the history index.
///
/// Also (re)constructs the per-payer payment index for every payer found in
/// the write-order payment log, so a history rebuild always leaves
/// `payments_by_payer` on its direct-read path (issue #445).
fn write_history_index(env: &Env, records: Vec<PaymentRecord>) -> Result<(), ContractError> {
    let count = records.len();

    // Collect every payer that owns per-payer index entries. The payment
    // log enumerates every recorded payment independently of the shared
    // index, so this stays correct even when the history index is corrupt.
    let owners = collect_payer_owners(env);

    // Clear existing indexes first
    clear_history_index(env);
    clear_payer_indexes(env, &owners);

    // Write each record and its per-payer mapping
    for (i, record) in records.iter().enumerate() {
        let key = DataKey::PaymentHistory(i as u32);
        env.storage().persistent().set(&key, &record);
        // Bump TTL
        env.storage().persistent().extend_ttl(
            &key,
            crate::storage::MIN_TTL,
            crate::storage::BUMP_TTL,
        );
        append_payer_entry(env, &record.payer, i as u32);
    }

    // Update history count
    set_history_count(env, count);

    Ok(())
}

/// Rebuilds only the per-payer payment index from an intact history index.
///
/// Used by the schema V1 → V2 migration when the shared history index does
/// not need repair: ordinals are assigned by walking the existing
/// `PaymentHistory` slots in order, so the per-payer view matches exactly
/// what the bounded-scan fallback would have produced.
fn rebuild_payer_indexes(env: &Env) {
    let owners = collect_payer_owners(env);
    clear_payer_indexes(env, &owners);

    let total = get_history_count(env);
    for i in 0..total {
        let record: Option<PaymentRecord> =
            env.storage().persistent().get(&DataKey::PaymentHistory(i));
        if let Some(record) = record {
            append_payer_entry(env, &record.payer, i);
        }
    }
}

/// Enumerate every payer with recorded payments via the write-order payment
/// log. The log survives history-index corruption, so this yields a complete
/// owner list even when `PaymentHistory` has holes — required to clear stale
/// per-payer entries before rebuilding.
fn collect_payer_owners(env: &Env) -> alloc::vec::Vec<soroban_sdk::Address> {
    let mut owners: alloc::vec::Vec<soroban_sdk::Address> = alloc::vec::Vec::new();
    let payment_count = get_payment_count(env);
    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                if !owners.contains(&record.payer) {
                    owners.push(record.payer);
                }
            }
        }
    }
    owners
}

/// Migration from schema version 0 (legacy) to version 1.
///
/// Schema V0: No ContractMeta, Payment keys only.
/// Schema V1: ContractMeta + PaymentV1 keys (with lazy migration on read).
///
/// This migration also:
/// - Rebuilds payment history index
/// - Records all settlement references for global uniqueness
pub fn migrate_schema_v0_to_v1(env: &Env) -> Result<(), ContractError> {
    // Step 1: Ensure ContractMeta exists
    ensure_current_contract_meta(env);

    // Step 2: Rebuild payment history index
    rebuild_payment_history_index(env)?;

    // Step 3: Record all existing settlement references for uniqueness
    migrate_settlement_refs(env)?;

    // Step 4: Update the storage schema version in metadata. This migration
    // targets V1 specifically; the upgrade driver runs later steps (e.g.
    // V1 → V2 per-payer index construction) separately.
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = STORAGE_SCHEMA_V1;
    set_contract_meta(env, &meta);

    Ok(())
}

/// Migration from schema version 1 to version 2.
///
/// Schema V2 introduces the per-payer payment index so `payments_by_payer`
/// serves pages with direct reads instead of an unbounded filtered scan of
/// the shared history index (issue #445).
///
/// - If the shared history index is intact, only per-payer indexes are
///   backfilled (ordinals mirror the existing slot order).
/// - If the index is missing or incomplete, it is rebuilt first; the rebuild
///   path constructs per-payer indexes as part of writing slots.
///
/// Idempotent: rebuilding indexes over the same record set converges to the
/// same layout, so interrupted migrations can simply be re-run.
pub fn migrate_schema_v1_to_v2(env: &Env) -> Result<(), ContractError> {
    if is_index_complete(env) {
        // Shared history index is intact — backfill payer indexes only.
        rebuild_payer_indexes(env);
    } else {
        // Repair the shared index first; write_history_index constructs
        // per-payer indexes as part of the rewrite.
        let records = collect_all_payment_records(env)?;
        let sorted = sort_records_by_timestamp(env, records);
        write_history_index(env, sorted)?;
    }

    // Update the storage schema version in metadata. This migration targets
    // V2 specifically; the upgrade driver runs later steps (e.g. V2 → V3
    // settlement-reference mapping backfill) separately. See the
    // maintenance note on `STORAGE_SCHEMA_VERSION` — never stamp that
    // constant directly from a non-final step.
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = STORAGE_SCHEMA_V2;
    set_contract_meta(env, &meta);

    Ok(())
}

/// Migrates existing settlement references to the reference-to-invoice
/// index.
///
/// This function scans all payment records and records their settlement_ref
/// → invoice_id mapping. This ensures that after an upgrade, existing
/// settlement references are both protected from reuse and resolvable back
/// to the invoice that consumed them (issue #495).
///
/// A settlement_ref already present in the index (from an earlier migration
/// run, or a genuine duplicate in pre-guard legacy data — see issue #497's
/// history) is **not** overwritten: the existing owner is left in place and
/// the payment is counted in `conflicts_skipped` rather than `migrated`, so
/// a real conflict surfaces via the emitted event instead of being silently
/// masked by the last write winning.
pub fn migrate_settlement_refs(env: &Env) -> Result<(), ContractError> {
    // Use the payment log to enumerate all invoice IDs
    let payment_count = get_payment_count(env);
    let mut migrated_count = 0u32;
    let mut conflicts_skipped = 0u32;

    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                if record.settlement_ref.is_empty() {
                    continue;
                }
                if is_settlement_ref_used(env, &record.settlement_ref) {
                    conflicts_skipped += 1;
                } else {
                    record_settlement_ref(env, &record.settlement_ref, &record.invoice_id);
                    migrated_count += 1;
                }
            }
        }
    }

    // Emit event for settlement reference migration
    if migrated_count > 0 || conflicts_skipped > 0 {
        events::emit_settlement_refs_migrated(env, migrated_count, conflicts_skipped);
    }

    Ok(())
}

/// Migration from schema version 2 to version 3.
///
/// Schema V3 changes what `DataKey::SettlementRef(ref)` stores: previously a
/// unit value marking the reference as "used", now the invoice_id that
/// consumed it, so `settlement_ref_owner` can resolve a reference back to
/// its owning invoice (issue #495).
///
/// Unlike `migrate_settlement_refs` (the V0 → V1 step), every existing entry
/// is unconditionally rewritten rather than skipped when already present:
/// this step is fixing the *value shape* of keys already known to be correct
/// (the pre-V3 write path already enforced settlement_ref uniqueness before
/// allowing a `record_payment` write), not resolving a genuine duplicate
/// conflict. Re-deriving from the payment log — the same source of truth
/// `migrate_settlement_refs` uses — also (re)builds the write-order
/// enumeration log (`SettlementRefLog`) so `settlement_ref_history` covers
/// every pre-existing reference, not just ones recorded after this upgrade.
///
/// # Verification
/// The result can be checked against the payment log with
/// [`verify_settlement_ref_index`]: it re-walks the same payment log and
/// confirms every non-empty `settlement_ref` resolves back to its own
/// `invoice_id`.
///
/// # Idempotency
/// The enumeration log (`SettlementRefLog` / `SettlementRefCount`) is reset
/// to empty before rebuilding, so re-running this step reproduces the same
/// log rather than appending a second copy of every entry. The primary
/// `SettlementRef(ref) -> invoice_id` mapping is naturally idempotent too —
/// writing the same owner twice is a no-op. Never read an existing
/// `SettlementRef` value here to decide whether to skip it: on a genuine
/// pre-V3 deployment that value is still the old unit shape, and decoding it
/// as a `String` traps the transaction — see `get_settlement_ref_owner`.
pub fn migrate_schema_v2_to_v3(env: &Env) -> Result<(), ContractError> {
    clear_settlement_ref_log(env);

    let payment_count = get_payment_count(env);
    let mut migrated_count = 0u32;
    let mut conflicts_skipped = 0u32;
    // Refs already (re)written in this pass, tracked in memory rather than
    // by reading the existing `SettlementRef` value back from storage: a
    // pre-existing entry may still be in the old unit-value shape, and
    // decoding that as a `String` traps the transaction. Walking the
    // payment log in the same order and keeping "first one wins" here
    // mirrors `migrate_settlement_refs`'s conflict rule exactly, so the two
    // steps always agree on which invoice owns a duplicated legacy
    // settlement_ref when both run in the same upgrade (a deployment
    // starting below V2 runs the V0 → V1 step first, in the same
    // transaction, immediately before this one).
    let mut seen: alloc::vec::Vec<String> = alloc::vec::Vec::new();

    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                if record.settlement_ref.is_empty() {
                    continue;
                }
                if seen.contains(&record.settlement_ref) {
                    conflicts_skipped += 1;
                } else {
                    seen.push(record.settlement_ref.clone());
                    record_settlement_ref(env, &record.settlement_ref, &record.invoice_id);
                    migrated_count += 1;
                }
            }
        }
    }

    if migrated_count > 0 || conflicts_skipped > 0 {
        events::emit_settlement_refs_migrated(env, migrated_count, conflicts_skipped);
    }

    // No longer the final step in the chain (V4 added the allowlist
    // enumeration index, #464) — stamp this step's own fixed constant per
    // the maintenance note on STORAGE_SCHEMA_VERSION, not that constant
    // directly.
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = STORAGE_SCHEMA_V3;
    set_contract_meta(env, &meta);

    Ok(())
}

/// Migration from schema version 3 to version 4.
///
/// Schema V4 adds a write-order enumeration index (`AllowListLog` /
/// `AllowListCount` / `AllowListIndex`) alongside the existing
/// `AllowList(code, issuer)` existence keys, so `allowed_assets()` /
/// `allowlist_count()` can paginate and size the allowlist instead of
/// requiring callers to already know which pairs to ask `is_asset_allowed`
/// about (issue #464).
///
/// # A fundamental recovery limit — read before relying on this
/// Soroban has no key enumeration, so there is no way to discover every
/// `AllowList(code, issuer)` key that exists on a legacy deployment
/// directly. This migration recovers every allowlisted asset that has been
/// used in at least one payment, by replaying the payment log (the same
/// technique `migrate_settlement_refs` uses) and checking each distinct
/// token seen against `is_asset_allowed`. An asset that was allowlisted but
/// has never been paid with before this upgrade runs is **not** recoverable
/// this way: it stays allowlisted — `is_asset_allowed`/`record_payment` are
/// completely unaffected, since this migration never touches the primary
/// `AllowList` key — but it will not appear in `allowed_assets()` /
/// count towards `allowlist_count()` until the admin calls `allow_asset`
/// for it again post-upgrade (a no-op on the existence check, but it
/// backfills the enumeration index via `backfill_allowlist_index`).
///
/// # Idempotency
/// Every discovered pair is backfilled through
/// [`crate::storage::backfill_allowlist_index`], which no-ops on a pair
/// that is already indexed. So re-running this step, or running it after
/// the admin has already called `allow_asset` post-upgrade for some pairs,
/// never creates a duplicate log entry or double-counts `allowlist_count()`.
pub fn migrate_schema_v3_to_v4(env: &Env) -> Result<(), ContractError> {
    let payment_count = get_payment_count(env);
    let mut discovered = 0u32;
    let mut seen: alloc::vec::Vec<(String, String)> = alloc::vec::Vec::new();

    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                if let crate::storage::Asset::Token(code, issuer) = record.asset {
                    if seen.iter().any(|(c, iss)| c == &code && iss == &issuer) {
                        continue;
                    }
                    seen.push((code.clone(), issuer.clone()));
                    if is_asset_allowed(env, &code, &issuer)
                        && backfill_allowlist_index(env, &code, &issuer)
                    {
                        discovered += 1;
                    }
                }
            }
        }
    }

    if discovered > 0 {
        events::emit_allowlist_index_backfilled(env, discovered);
    }

    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = STORAGE_SCHEMA_VERSION;
    set_contract_meta(env, &meta);

    Ok(())
}

/// Verify that the settlement-reference index matches the payment log.
///
/// Walks every recorded payment (via the same write-order payment log used
/// by [`collect_all_payment_records`]) and confirms its non-empty
/// `settlement_ref` resolves back to its own `invoice_id` through
/// [`get_settlement_ref_owner`]. Used by tests and available to ops tooling
/// to confirm `migrate_settlement_refs` / `migrate_schema_v2_to_v3` produced
/// a consistent mapping (issue #495).
///
/// Returns `(verified, mismatched)`:
/// - `verified` — payments whose settlement_ref correctly resolves back to
///   their own invoice_id (or that legitimately have no settlement_ref).
/// - `mismatched` — payments with a non-empty settlement_ref that resolves
///   to nothing, or to a *different* invoice_id (e.g. a conflict
///   `migrate_settlement_refs` deliberately skipped rather than overwrite).
///
/// O(n) in the number of payments — like `rebuild_payment_history_index`,
/// this is a maintenance-window operation, not a bounded per-call read, so
/// it is deliberately not exposed as a contract entrypoint. Callers needing
/// an on-chain, permissionless check should instead page through
/// `payment_history` and cross-check `settlement_ref_owner` for each record,
/// or use the O(1) `settlement_ref_index_status` summary for a quick signal.
pub fn verify_settlement_ref_index(env: &Env) -> (u32, u32) {
    let payment_count = get_payment_count(env);
    let mut verified = 0u32;
    let mut mismatched = 0u32;

    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                if record.settlement_ref.is_empty() {
                    verified += 1;
                    continue;
                }
                match get_settlement_ref_owner(env, &record.settlement_ref) {
                    Some(owner) if owner == record.invoice_id => verified += 1,
                    _ => mismatched += 1,
                }
            }
        }
    }

    (verified, mismatched)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{InvoicePaymentContract, InvoicePaymentContractClient};
    use alloc::format;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Address, Env, String,
    };

    fn setup_test(env: &Env) -> (InvoicePaymentContractClient<'_>, Address) {
        let admin = Address::generate(env);
        let contract_id = env.register(InvoicePaymentContract, ());
        let client = InvoicePaymentContractClient::new(env, &contract_id);

        // Initialize
        client.initialize(&admin);

        (client, admin)
    }

    #[test]
    fn test_rebuild_history_index_empty() {
        let env = Env::default();
        let (client, _admin) = setup_test(&env);
        env.mock_all_auths();

        // Call rebuild directly via the contract
        let result = client.try_upgrade_storage(&_admin);
        assert!(result.is_ok());

        // History should be empty
        let history = client.payment_history(&0u32, &10u32);
        assert_eq!(history.records.len(), 0);
        assert_eq!(history.next_cursor, 0);
        assert!(!history.has_more);
    }

    #[test]
    fn test_rebuild_history_index_with_records() {
        let env = Env::default();
        let (client, admin) = setup_test(&env);
        env.mock_all_auths();

        // Add some payments
        let payer = Address::generate(&env);
        client.set_allow_native(&true);

        for i in 0..5u32 {
            let invoice_id = String::from_str(&env, &format!("inv-{:02}", i));
            client.record_payment(
                &invoice_id,
                &payer,
                &String::from_str(&env, "XLM"),
                &String::from_str(&env, ""),
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-{:02}", i)),
            );
        }

        // Verify initial history
        let history = client.payment_history(&0u32, &10u32);
        assert_eq!(history.records.len(), 5);

        // Simulate a migration that clears and rebuilds
        // In production, this would be called via upgrade_storage()
        // For testing, we'll call it directly

        // Clear the history index manually to simulate incomplete migration
        env.as_contract(&client.address, || {
            for i in 0..5u32 {
                let key = DataKey::PaymentHistory(i);
                env.storage().persistent().remove(&key);
            }
            env.storage()
                .instance()
                .set(&DataKey::PaymentHistoryCount, &0u32);
        });

        // History should now be empty
        let empty = client.payment_history(&0u32, &10u32);
        assert_eq!(empty.records.len(), 0);

        // Rebuild the index
        let result = client.try_upgrade_storage(&admin);
        assert!(result.is_ok());

        // History should be restored
        let rebuilt = client.payment_history(&0u32, &10u32);
        assert_eq!(rebuilt.records.len(), 5);
        assert_eq!(rebuilt.next_cursor, 5);
        assert!(!rebuilt.has_more);
    }

    #[test]
    fn test_rebuild_history_index_preserves_order() {
        let env = Env::default();
        let (client, admin) = setup_test(&env);
        env.mock_all_auths();

        // Add payments with different timestamps
        let payer = Address::generate(&env);
        client.set_allow_native(&true);

        // We can't directly set timestamps, but they'll be in insertion order
        let invoice_ids = ["inv-a", "inv-b", "inv-c"];
        for (i, id) in invoice_ids.iter().enumerate() {
            // Advance time between records
            let ts = env.ledger().timestamp();
            env.ledger().set_timestamp(ts + 10);

            let invoice_id = String::from_str(&env, id);
            client.record_payment(
                &invoice_id,
                &payer,
                &String::from_str(&env, "XLM"),
                &String::from_str(&env, ""),
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-{}", id)),
            );
        }

        // Verify order
        let history = client.payment_history(&0u32, &10u32);
        assert_eq!(history.records.len(), 3);
        assert_eq!(
            history.records.get(0).unwrap().invoice_id,
            String::from_str(&env, "inv-a")
        );
        assert_eq!(
            history.records.get(1).unwrap().invoice_id,
            String::from_str(&env, "inv-b")
        );
        assert_eq!(
            history.records.get(2).unwrap().invoice_id,
            String::from_str(&env, "inv-c")
        );

        // Clear and rebuild
        env.as_contract(&client.address, || {
            for i in 0..3u32 {
                let key = DataKey::PaymentHistory(i);
                env.storage().persistent().remove(&key);
            }
            env.storage()
                .instance()
                .set(&DataKey::PaymentHistoryCount, &0u32);
        });

        let result = client.try_upgrade_storage(&admin);
        assert!(result.is_ok());

        // Verify order is preserved
        let rebuilt = client.payment_history(&0u32, &10u32);
        assert_eq!(rebuilt.records.len(), 3);
        assert_eq!(
            rebuilt.records.get(0).unwrap().invoice_id,
            String::from_str(&env, "inv-a")
        );
        assert_eq!(
            rebuilt.records.get(1).unwrap().invoice_id,
            String::from_str(&env, "inv-b")
        );
        assert_eq!(
            rebuilt.records.get(2).unwrap().invoice_id,
            String::from_str(&env, "inv-c")
        );
    }

    #[test]
    fn test_rebuild_history_index_idempotent() {
        let env = Env::default();
        let (client, admin) = setup_test(&env);
        env.mock_all_auths();

        // Add some payments
        let payer = Address::generate(&env);
        client.set_allow_native(&true);
        for i in 0..3u32 {
            let invoice_id = String::from_str(&env, &format!("inv-{:02}", i));
            client.record_payment(
                &invoice_id,
                &payer,
                &String::from_str(&env, "XLM"),
                &String::from_str(&env, ""),
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-{:02}", i)),
            );
        }

        // Upgrade once
        let result1 = client.try_upgrade_storage(&admin);
        assert!(result1.is_ok());
        let history1 = client.payment_history(&0u32, &10u32);
        assert_eq!(history1.records.len(), 3);

        // Upgrade again (idempotent)
        let result2 = client.try_upgrade_storage(&admin);
        assert!(result2.is_ok());
        let history2 = client.payment_history(&0u32, &10u32);
        assert_eq!(history2.records.len(), 3);

        // Counts should match
        assert_eq!(client.payment_count(), 3);
        let history = client.payment_history(&0u32, &10u32);
        assert_eq!(history.records.len(), 3);
    }
}
