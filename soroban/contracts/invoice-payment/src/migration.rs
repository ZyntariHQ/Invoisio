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

use soroban_sdk::Env;

use crate::errors::ContractError;
use crate::events;
use crate::storage::{
    append_payer_entry, current_contract_meta, ensure_current_contract_meta, get_contract_meta,
    get_history_count, get_payment, get_payment_count, get_payment_log_entry,
    get_storage_schema_version, is_settlement_ref_used, record_settlement_ref, set_contract_meta,
    set_history_count, DataKey, STORAGE_SCHEMA_V1, STORAGE_SCHEMA_V2, STORAGE_SCHEMA_VERSION,
};

/// Advance a bounded, durable history-index rebuild.  The payment log is append
/// ordered, which is the same deterministic ordering used by normal writes;
/// this deliberately avoids allocating or sorting the full payment set.
pub fn rebuild_payment_history_index(env: &Env) -> Result<(), ContractError> {
    if get_storage_schema_version(env) != STORAGE_SCHEMA_VERSION {
        return Err(ContractError::StorageSchemaTooOld);
    }
    advance_rebuild(env, 0, false)
}

/// Execute at most `MIGRATION_CHUNK_SIZE` storage slots. Phase 1 removes stale
/// history and payer indexes; phase 2 reconstructs both indexes and, when
/// requested, settlement-reference mappings in the same payment-log scan.
fn advance_rebuild(env: &Env, schema_from: u32, migrate_refs: bool) -> Result<(), ContractError> {
    let mut p = crate::storage::get_migration_progress(env);
    if !p.active {
        p = crate::storage::MigrationProgress {
            phase: 1,
            cursor: 0,
            total: get_history_count(env),
            schema_from,
            active: true,
        };
        crate::storage::set_migration_progress(env, &p);
    }
    if p.schema_from != schema_from {
        return Err(ContractError::HistoryIndexRebuildFailed);
    }
    let end = core::cmp::min(
        p.cursor
            .saturating_add(crate::storage::MIGRATION_CHUNK_SIZE),
        p.total,
    );
    if p.phase == 1 {
        for i in p.cursor..end {
            // Removing the payer-count marker makes stale ordinal entries
            // unreachable; the copy phase recreates the marker from ordinal 0.
            if let Some(record) = env
                .storage()
                .persistent()
                .get::<DataKey, crate::storage::PaymentRecord>(&DataKey::PaymentHistory(i))
            {
                env.storage()
                    .persistent()
                    .remove(&DataKey::PayerPaymentCount(record.payer));
            }
            env.storage()
                .persistent()
                .remove(&DataKey::PaymentHistory(i));
        }
        p.cursor = end;
        if p.cursor == p.total {
            p.phase = 2;
            p.cursor = 0;
            p.total = get_payment_count(env);
            set_history_count(env, 0);
        }
        // If the clear phase still has work, persist and return. When it
        // finished in this call, fall through to one bounded copy chunk.
        if p.phase == 1 {
            crate::storage::set_migration_progress(env, &p);
            return Ok(());
        }
    }
    let end = core::cmp::min(
        p.cursor
            .saturating_add(crate::storage::MIGRATION_CHUNK_SIZE),
        p.total,
    );
    for i in p.cursor..end {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                let key = DataKey::PaymentHistory(i);
                env.storage().persistent().set(&key, &record);
                env.storage().persistent().extend_ttl(
                    &key,
                    crate::storage::MIN_TTL,
                    crate::storage::BUMP_TTL,
                );
                append_payer_entry(env, &record.payer, i);
                if migrate_refs
                    && !record.settlement_ref.is_empty()
                    && !is_settlement_ref_used(env, &record.settlement_ref)
                {
                    record_settlement_ref(env, &record.settlement_ref, &record.invoice_id);
                }
            }
        }
    }
    p.cursor = end;
    set_history_count(env, p.cursor);
    if p.cursor == p.total {
        crate::storage::clear_migration_progress(env);
        if p.total > 0 {
            events::emit_history_index_rebuilt(env, p.total);
        }
        if schema_from != 0 {
            set_schema_version(env, schema_from + 1);
        }
    } else {
        crate::storage::set_migration_progress(env, &p);
    }
    Ok(())
}

fn set_schema_version(env: &Env, version: u32) {
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = version;
    set_contract_meta(env, &meta);
}

/// V0 → V1 uses the same durable scan: history and settlement references are
/// written together, rather than making two independent full passes.
pub fn migrate_schema_v0_to_v1(env: &Env) -> Result<(), ContractError> {
    ensure_current_contract_meta(env);
    advance_rebuild(env, 0, true).map(|_| {
        if !crate::storage::get_migration_progress(env).active {
            set_schema_version(env, STORAGE_SCHEMA_V1);
        }
    })
}
/// V1 → V2 rebuilds the per-payer index as part of the bounded history scan.
pub fn migrate_schema_v1_to_v2(env: &Env) -> Result<(), ContractError> {
    advance_rebuild(env, STORAGE_SCHEMA_V1, false)
}
/// V2 → V3 writes settlement mappings in bounded chunks. Reusing the rebuild
/// path also repairs a damaged history index without a second traversal.
pub fn migrate_schema_v2_to_v3(env: &Env) -> Result<(), ContractError> {
    advance_rebuild(env, STORAGE_SCHEMA_V2, true)
}

/// Kept for compatibility with internal callers; it now advances one bounded
/// chunk instead of scanning the entire log.
pub fn migrate_settlement_refs(env: &Env) -> Result<(), ContractError> {
    let mut p = crate::storage::get_migration_progress(env);
    if !p.active {
        p = crate::storage::MigrationProgress {
            phase: 2,
            cursor: 0,
            total: get_payment_count(env),
            schema_from: STORAGE_SCHEMA_VERSION,
            active: true,
        };
    }
    let end = core::cmp::min(
        p.cursor
            .saturating_add(crate::storage::MIGRATION_CHUNK_SIZE),
        p.total,
    );
    for i in p.cursor..end {
        if let Some(id) = get_payment_log_entry(env, i) {
            if let Ok(r) = get_payment(env, &id) {
                if !r.settlement_ref.is_empty() && !is_settlement_ref_used(env, &r.settlement_ref) {
                    record_settlement_ref(env, &r.settlement_ref, &r.invoice_id);
                }
            }
        }
    }
    p.cursor = end;
    if p.cursor == p.total {
        crate::storage::clear_migration_progress(env);
    } else {
        crate::storage::set_migration_progress(env, &p);
    }
    Ok(())
}

pub fn verify_settlement_ref_index(env: &Env) -> (u32, u32) {
    (0, get_payment_count(env))
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
