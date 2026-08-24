//! Migration helper functions for rebuilding payment history indexes.
//!
//! This module provides utilities for enumerating payment records during
//! migration. Since Soroban doesn't support key enumeration, we use a
//! combination of tracking mechanisms.

use soroban_sdk::{Env, Vec};

use crate::storage::{DataKey, PaymentRecord};

/// Iterator over payment records stored in the contract.
///
/// This is a best-effort iterator that uses the `PaymentHistory` index
/// as the primary source of truth. If the index is incomplete, it will
/// attempt to recover records from the payment keys.
pub struct PaymentRecordIterator<'a> {
    env: &'a Env,
    current_index: u32,
    total_count: u32,
    exhausted: bool,
}

impl<'a> PaymentRecordIterator<'a> {
    /// Creates a new iterator over all payment records.
    pub fn new(env: &'a Env) -> Self {
        let total_count = env
            .storage()
            .instance()
            .get(&DataKey::PaymentCount)
            .unwrap_or(0u32);

        Self {
            env,
            current_index: 0,
            total_count,
            exhausted: total_count == 0,
        }
    }

    /// Returns the next payment record, if any.
    ///
    /// Skips missing slots (a corrupted or partially-rebuilt index) instead
    /// of stopping at the first one, so a single hole can't cut off every
    /// record after it — the scan only ends once every index up to
    /// `total_count` has been visited.
    pub fn next_record(&mut self) -> Option<PaymentRecord> {
        while !self.exhausted {
            let history_key = DataKey::PaymentHistory(self.current_index);
            let found = self
                .env
                .storage()
                .persistent()
                .get::<DataKey, PaymentRecord>(&history_key);

            self.current_index += 1;
            if self.current_index >= self.total_count {
                self.exhausted = true;
            }

            if found.is_some() {
                return found;
            }
            // Missing slot: keep scanning instead of stopping here.
        }
        None
    }

    /// Collects all payment records into a vector.
    pub fn collect_all(&mut self) -> Vec<PaymentRecord> {
        let mut records = Vec::new(self.env);
        while let Some(record) = self.next_record() {
            records.push_back(record);
        }
        records
    }
}

/// Legacy migration helper that attempts to recover payment records from
/// legacy storage keys.
///
/// This is used when upgrading from schema version 0 where the history index
/// may not exist or be incomplete.
pub fn collect_legacy_payments(env: &Env) -> Vec<PaymentRecord> {
    let mut records: Vec<PaymentRecord> = Vec::new(env);

    // We can't enumerate legacy keys directly. Instead, we rely on the
    // payment count and try to reconstruct records from the history index.
    // If the history index is empty, we have no way to recover legacy records
    // without knowing the invoice IDs.

    // The recommended approach for production deployments is to:
    // 1. Maintain a list of invoice IDs in a separate storage entry
    // 2. Use that list during migration to rebuild the history index
    // 3. Or, use the PaymentHistory index if it was partially built

    // For this implementation, we'll use the history index if it has records,
    // otherwise we'll return an empty vector and log a warning.
    let history_count = env
        .storage()
        .instance()
        .get(&DataKey::PaymentHistoryCount)
        .unwrap_or(0u32);

    if history_count > 0 {
        for i in 0..history_count {
            let key = DataKey::PaymentHistory(i);
            if let Some(record) = env
                .storage()
                .persistent()
                .get::<DataKey, PaymentRecord>(&key)
            {
                records.push_back(record);
            }
        }
    }

    records
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{InvoicePaymentContract, InvoicePaymentContractClient};
    use alloc::format;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    fn setup_test(env: &Env) -> (InvoicePaymentContractClient<'_>, Address) {
        let admin = Address::generate(env);
        let contract_id = env.register(InvoicePaymentContract, ());
        let client = InvoicePaymentContractClient::new(env, &contract_id);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_payment_record_iterator_empty() {
        let env = Env::default();
        let (client, _admin) = setup_test(&env);

        let records = env.as_contract(&client.address, || {
            let mut iterator = PaymentRecordIterator::new(&env);
            iterator.collect_all()
        });
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_payment_record_iterator_with_records() {
        let env = Env::default();
        let (client, _admin) = setup_test(&env);
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

        let records = env.as_contract(&client.address, || {
            let mut iterator = PaymentRecordIterator::new(&env);
            iterator.collect_all()
        });
        assert_eq!(records.len(), 3);
    }

    #[test]
    fn test_payment_record_iterator_skips_missing_slot() {
        let env = Env::default();
        let (client, _admin) = setup_test(&env);
        env.mock_all_auths();

        let payer = Address::generate(&env);
        client.set_allow_native(&true);
        for i in 0..3u32 {
            let invoice_id = String::from_str(&env, &format!("iter-gap-{:02}", i));
            client.record_payment(
                &invoice_id,
                &payer,
                &String::from_str(&env, "XLM"),
                &String::from_str(&env, ""),
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-{:02}", i)),
            );
        }

        // Remove the middle slot, leaving a hole below `total_count`.
        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .remove(&DataKey::PaymentHistory(1));
        });

        let records = env.as_contract(&client.address, || {
            let mut iterator = PaymentRecordIterator::new(&env);
            iterator.collect_all()
        });
        // Before the fix, the iterator stopped permanently at the first
        // missing slot and would have returned only the record at index 0.
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn test_collect_legacy_payments() {
        let env = Env::default();
        let (client, _admin) = setup_test(&env);
        env.mock_all_auths();

        // Add some payments
        let payer = Address::generate(&env);
        client.set_allow_native(&true);
        for i in 0..3u32 {
            let invoice_id = String::from_str(&env, &format!("legacy-{:02}", i));
            client.record_payment(
                &invoice_id,
                &payer,
                &String::from_str(&env, "XLM"),
                &String::from_str(&env, ""),
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-{:02}", i)),
            );
        }

        let records = env.as_contract(&client.address, || collect_legacy_payments(&env));
        // Should find records in the history index
        assert_eq!(records.len(), 3);
    }
}
