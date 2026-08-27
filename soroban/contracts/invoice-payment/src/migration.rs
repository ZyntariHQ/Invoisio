//! Storage schema migration utilities for rebuilding payment history indexes.
//!
//! This module provides the migration logic to rebuild payment history indexes
//! and counts for legacy data during storage upgrades. It ensures that
//! `payment_history()` returns complete results after upgrade without requiring
//! ad-hoc reads.

use soroban_sdk::{Env, Vec};

use crate::errors::ContractError;
use crate::events;
use crate::storage::{
    current_contract_meta, ensure_current_contract_meta, get_contract_meta, get_history_count,
    get_payment, get_payment_log_entry, get_storage_schema_version, record_settlement_ref,
    set_contract_meta, set_history_count, DataKey, PaymentRecord, STORAGE_SCHEMA_VERSION,
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
fn write_history_index(env: &Env, records: Vec<PaymentRecord>) -> Result<(), ContractError> {
    let count = records.len();

    // Clear existing index first
    clear_history_index(env);

    // Write each record
    for (i, record) in records.iter().enumerate() {
        let key = DataKey::PaymentHistory(i as u32);
        env.storage().persistent().set(&key, &record);
        // Bump TTL
        env.storage().persistent().extend_ttl(
            &key,
            crate::storage::MIN_TTL,
            crate::storage::BUMP_TTL,
        );
    }

    // Update history count
    set_history_count(env, count);

    Ok(())
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

    // Step 4: Update the storage schema version in metadata
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = STORAGE_SCHEMA_VERSION;
    set_contract_meta(env, &meta);

    Ok(())
}

/// Migrates existing settlement references to the global uniqueness index.
///
/// This function scans all payment records and records their settlement_ref
/// values in the `SettlementRef` index. This ensures that after an upgrade,
/// existing settlement references are protected from being reused.
pub fn migrate_settlement_refs(env: &Env) -> Result<(), ContractError> {
    // Use the payment log to enumerate all invoice IDs
    let payment_count = get_payment_count(env);
    let mut migrated_count = 0u32;

    for i in 0..payment_count {
        if let Some(invoice_id) = get_payment_log_entry(env, i) {
            if let Ok(record) = get_payment(env, &invoice_id) {
                // Record the settlement reference as used
                if !record.settlement_ref.is_empty() {
                    record_settlement_ref(env, &record.settlement_ref);
                    migrated_count += 1;
                }
            }
        }
    }

    // Emit event for settlement reference migration
    if migrated_count > 0 {
        events::emit_settlement_refs_migrated(env, migrated_count);
    }

    Ok(())
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
