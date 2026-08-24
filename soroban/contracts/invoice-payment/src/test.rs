#![cfg(test)]
#![allow(clippy::all)]

use super::*;
use crate::storage::{AllowlistMode, ContractConfig};
use alloc::format;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String,
};

// TTL / Helpers

/// Deploy the contract and call `initialize`, returning the client and admin.
fn setup(env: &Env) -> (InvoicePaymentContractClient<'_>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(env, &contract_id);
    client.initialize(&admin);
    (client, admin)
}

/// XLM payment helper: 1 XLM = 10_000_000 stroops.
fn record_xlm(
    env: &Env,
    client: &InvoicePaymentContractClient,
    invoice_id: &str,
    payer: &Address,
    stroops: i128,
) {
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(env, invoice_id),
        payer,
        &String::from_str(env, "XLM"),
        &String::from_str(env, ""), // no issuer for native asset
        &stroops,
        // Derived from invoice_id so repeated calls within a test (each
        // using a distinct invoice_id) don't collide under global
        // settlement reference uniqueness.
        &String::from_str(env, &format!("settle-xlm-default-{invoice_id}")),
    );
}

// Initialisation

#[test]
fn test_initialize_sets_admin_and_zero_count() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.payment_count(), 0);
}

#[test]
fn test_initialize_sets_version_metadata() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    assert_eq!(client.contract_version(), CONTRACT_VERSION);
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );
}

#[test]
fn test_config_before_initialize_reports_uninitialized_state() {
    let env = Env::default();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    assert_eq!(
        client.config(),
        ContractConfig {
            admin: None,
            pending_admin: None,
            initialized: false,
            version: ContractMeta {
                contract_version: 0,
                storage_schema_version: 0,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: false,
                requires_token_allowlist: true,
            },
            paused: false
        }
    );
}

#[test]
fn test_config_after_initialize_returns_high_level_snapshot() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    assert_eq!(
        client.config(),
        ContractConfig {
            admin: Some(admin),
            pending_admin: None,
            initialized: true,
            version: ContractMeta {
                contract_version: CONTRACT_VERSION,
                storage_schema_version: STORAGE_SCHEMA_VERSION,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: false,
                requires_token_allowlist: true,
            },
            paused: false
        }
    );
}

#[test]
fn test_contract_version_is_packed_semver() {
    assert_eq!(
        CONTRACT_VERSION,
        CONTRACT_VERSION_MAJOR * 1_000_000
            + CONTRACT_VERSION_MINOR * 1_000
            + CONTRACT_VERSION_PATCH
    );
}

#[test]
fn test_initialize_twice_returns_error() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    // try_initialize returns Result — second call must fail with AlreadyInitialized.
    let result = client.try_initialize(&admin);
    assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
}

// record_payment

#[test]
fn test_record_payment_xlm_stores_record() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-abc123");
    let payer = Address::generate(&env);

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128, // 1 XLM
        &String::from_str(&env, "settle-xlm-abc123"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.invoice_id, invoice_id);
    assert_eq!(record.payer, payer);
    assert_eq!(record.asset, Asset::Native);
    assert_eq!(record.amount, 10_000_000i128);
    assert_eq!(
        record.settlement_ref,
        String::from_str(&env, "settle-xlm-abc123")
    );
}

#[test]
fn test_record_payment_usdc_stores_issuer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-usdc01");
    let payer = Address::generate(&env);
    // Circle USDC issuer on Stellar testnet
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &issuer,
        &50_000_000i128, // 5 USDC (7-decimal)
        &String::from_str(&env, "settle-usdc-01"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(
        record.asset,
        Asset::Token(String::from_str(&env, "USDC"), issuer.clone(),)
    );
    assert_eq!(record.amount, 50_000_000i128);
    assert_eq!(
        record.settlement_ref,
        String::from_str(&env, "settle-usdc-01")
    );
}

#[test]
fn test_record_payment_increments_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-001", &payer, 10_000_000);
    record_xlm(&env, &client, "invoisio-002", &payer, 20_000_000);
    record_xlm(&env, &client, "invoisio-003", &payer, 30_000_000);

    assert_eq!(client.payment_count(), 3);
}

#[test]
fn test_payment_history_pages_deterministically() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..3u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-history-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-hist-{idx:02}")),
        );
    }

    let first_page = client.payment_history(&0u32, &2u32);
    assert_eq!(first_page.records.len(), 2);
    assert_eq!(first_page.next_cursor, 2);
    assert!(first_page.has_more);
    assert_eq!(
        first_page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-history-00")
    );
    assert_eq!(
        first_page.records.get(1).unwrap().invoice_id,
        String::from_str(&env, "invoisio-history-01")
    );

    let second_page = client.payment_history(&first_page.next_cursor, &2u32);
    assert_eq!(second_page.records.len(), 1);
    assert_eq!(second_page.next_cursor, 3);
    assert!(!second_page.has_more);
    assert_eq!(
        second_page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-history-02")
    );

    let empty_page = client.payment_history(&99u32, &2u32);
    assert_eq!(empty_page.records.len(), 0);
    assert_eq!(empty_page.next_cursor, 3);
    assert!(!empty_page.has_more);
}

#[test]
fn test_payment_history_page_size_is_capped() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..26u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-cap-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &(10_000_000i128 + idx as i128),
            &String::from_str(&env, &format!("settle-cap-{idx:02}")),
        );
    }

    let first_page = client.payment_history(&0u32, &100u32);
    assert_eq!(first_page.records.len(), 25);
    assert_eq!(first_page.next_cursor, 25);
    assert!(first_page.has_more);

    let second_page = client.payment_history(&first_page.next_cursor, &100u32);
    assert_eq!(second_page.records.len(), 1);
    assert_eq!(second_page.next_cursor, 26);
    assert!(!second_page.has_more);
}

/// Regression test for #418: a missing history-index slot must be skipped,
/// not treated as the end of the page — the page should still return every
/// other record it can reach and report the hole via `gaps_skipped`.
#[test]
fn test_payment_history_skips_missing_slot_mid_page() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..5u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-gap-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-gap-{idx:02}")),
        );
    }

    // Corrupt slot 2 only, leaving the count untouched — a hole in the
    // middle of an otherwise-dense index, e.g. from an expired TTL entry.
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(2));
    });

    let page = client.payment_history(&0u32, &10u32);
    assert_eq!(page.records.len(), 4);
    assert_eq!(page.gaps_skipped, 1);
    assert_eq!(page.next_cursor, 5);
    assert!(!page.has_more);
    let returned_ids: alloc::vec::Vec<_> = page.records.iter().map(|r| r.invoice_id).collect();
    assert_eq!(
        returned_ids,
        alloc::vec![
            String::from_str(&env, "invoisio-gap-00"),
            String::from_str(&env, "invoisio-gap-01"),
            String::from_str(&env, "invoisio-gap-03"),
            String::from_str(&env, "invoisio-gap-04"),
        ]
    );
}

/// Regression test for #418: before the fix, a page that hit a hole
/// returned `next_cursor` unchanged from the caller's `cursor` while still
/// reporting `has_more = true`, so a client looping on `has_more` would call
/// with the exact same cursor forever. Simulate that loop with a bounded
/// iteration count and assert it actually terminates.
#[test]
fn test_payment_history_missing_slot_does_not_deadlock_pagination_loop() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..6u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-loop-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-loop-{idx:02}")),
        );
    }

    // Corrupt the very first slot a paginating client will land on.
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(0));
    });

    let mut cursor = 0u32;
    let mut total_records = 0u32;
    let mut total_gaps = 0u32;
    let mut iterations = 0u32;
    loop {
        iterations += 1;
        assert!(iterations <= 10, "pagination loop did not terminate");

        let page = client.payment_history(&cursor, &2u32);
        // The cursor must always make forward progress — a repeated cursor
        // is exactly the deadlock this test guards against.
        assert!(page.next_cursor > cursor || !page.has_more);

        total_records += page.records.len() as u32;
        total_gaps += page.gaps_skipped;
        cursor = page.next_cursor;

        if !page.has_more {
            break;
        }
    }

    assert_eq!(total_records, 5);
    assert_eq!(total_gaps, 1);
    assert_eq!(cursor, 6);
}

/// Regression test for #418 (scan path): `payments_by_payer` on the bounded
/// scan fallback must skip a missing slot the same way `payment_history`
/// does, distinguishing a real gap from a slot that belongs to a different
/// payer.
///
/// With the per-payer index intact (#445), corruption in *another payer's*
/// slot is no longer visible in this payer's page — the second half of the
/// test pins that improvement.
#[test]
fn test_payments_by_payer_skips_missing_slot() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    let other_payer = Address::generate(&env);

    record_xlm(&env, &client, "invoisio-mine-00", &payer, 10_000_000);
    record_xlm(&env, &client, "invoisio-theirs", &other_payer, 20_000_000);
    record_xlm(&env, &client, "invoisio-mine-01", &payer, 30_000_000);

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(1));
    });

    // Indexed path: the removed slot belongs to another payer, so this
    // payer's view is unaffected by it.
    let indexed = client.payments_by_payer(&payer, &0u32, &10u32);
    assert_eq!(indexed.records.len(), 2);
    assert_eq!(indexed.gaps_skipped, 0);
    assert_eq!(indexed.next_cursor, 2);
    assert!(!indexed.has_more);

    // Scan fallback: the shared-index walk sees the hole and reports it.
    strip_payer_index(&env, &client, &payer);
    let page = client.payments_by_payer(&payer, &0u32, &10u32);
    assert_eq!(page.records.len(), 2);
    assert_eq!(page.gaps_skipped, 1);
    assert_eq!(page.next_cursor, 3);
    assert!(!page.has_more);
}

/// Regression test for #418: once a corrupted index has been repaired via
/// `rebuild_history_index`, pagination must report zero gaps again.
#[test]
fn test_payment_history_has_no_gaps_after_rebuild() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    for idx in 0..4u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-rebuild-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-rebuild-{idx:02}")),
        );
    }

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(1));
    });

    let corrupted = client.payment_history(&0u32, &10u32);
    assert_eq!(corrupted.gaps_skipped, 1);
    assert_eq!(corrupted.records.len(), 3);

    client.rebuild_history_index(&admin);

    let rebuilt = client.payment_history(&0u32, &10u32);
    assert_eq!(rebuilt.gaps_skipped, 0);
    assert_eq!(rebuilt.records.len(), 4);
    assert!(!rebuilt.has_more);
}

#[test]
fn test_duplicate_invoice_id_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    record_xlm(&env, &client, "invoisio-dup", &payer, 10_000_000);

    // try_record_payment returns Result — duplicate must fail.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-dup"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-dup"),
    );
    assert_eq!(result, Err(Ok(ContractError::PaymentAlreadyRecorded)));
}

// Prevent duplicate payments — acceptance-criteria tests

/// AC-1 Happy path: first record_payment succeeds, the payment_recorded event is
/// emitted, and the payment counter increments to 1.
#[test]
fn test_first_payment_succeeds_emits_event_and_increments_count() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-dedup-happy");
    let payer = Address::generate(&env);

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-dedup-happy"),
    );

    // Check event BEFORE any further contract call; env.events().all() returns
    // events from the last invocation only and is overwritten on the next call.
    let inv_val: soroban_sdk::Val = invoice_id.clone().into_val(&env);
    let pyr_val: soroban_sdk::Val = payer.clone().into_val(&env);
    let code_val: soroban_sdk::Val = String::from_str(&env, "XLM").into_val(&env);
    let iss_val: soroban_sdk::Val = String::from_str(&env, "").into_val(&env);
    let amt_val: soroban_sdk::Val = 10_000_000i128.into_val(&env);
    let ref_val: soroban_sdk::Val = String::from_str(&env, "settle-dedup-happy").into_val(&env);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "invoice_payment_recorded").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "invoice_id"), inv_val),
                    (Symbol::new(&env, "payer"), pyr_val),
                    (Symbol::new(&env, "asset_code"), code_val),
                    (Symbol::new(&env, "asset_issuer"), iss_val),
                    (Symbol::new(&env, "amount"), amt_val),
                    (Symbol::new(&env, "settlement_ref"), ref_val),
                    (Symbol::new(&env, "schema_version"), 1u32.into_val(&env))
                ]
                .into_val(&env),
            ),
        ]
    );

    // Counter must be 1 and record must be present.
    assert_eq!(client.payment_count(), 1);
    assert!(client.has_payment(&invoice_id));
}

/// AC-2 Duplicate: a second record_payment for the same invoice_id must revert
/// with PaymentAlreadyRecorded, emit no event, and leave the counter unchanged.
#[test]
fn test_duplicate_payment_fails_no_event_count_unchanged() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-dedup-dup2");
    let payer = Address::generate(&env);

    // First payment — must succeed and count becomes 1.
    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-dedup-dup2"),
    );
    assert_eq!(client.payment_count(), 1);

    // Second payment with the identical invoice_id — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-dedup-dup2-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::PaymentAlreadyRecorded)));

    // No event emitted by the failed call — the error path exits before emit.
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![&env],
        "no payment_recorded event must be emitted on a duplicate attempt"
    );

    // State must be completely unchanged: counter still 1.
    assert_eq!(client.payment_count(), 1);
}

/// AC-3 Cross-asset duplicate: attempting to record a payment for an already
/// recorded invoice_id using a *different* asset must still fail.
/// invoice_id is the sole uniqueness key — not (invoice_id, asset).
#[test]
fn test_cross_asset_duplicate_same_invoice_id_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-dedup-cross");
    let payer = Address::generate(&env);
    let usdc_issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    // First payment: XLM — succeeds.
    client.set_allow_native(&true);
    client.allow_asset(&String::from_str(&env, "USDC"), &usdc_issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-cross-xlm"),
    );
    assert_eq!(client.payment_count(), 1);

    // Second attempt: same invoice_id but USDC — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &usdc_issuer,
        &50_000_000i128,
        &String::from_str(&env, "settle-cross-usdc"),
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::PaymentAlreadyRecorded)),
        "invoice_id is the unique key; different asset must not bypass the guard"
    );

    // Counter must remain 1 — no additional write took place.
    assert_eq!(client.payment_count(), 1);
}

#[test]
fn test_record_payment_rejects_when_admin_not_authorised() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-unauth");
    let payer = Address::generate(&env);

    // Only the payer authorises the call; the admin does NOT.
    env.mock_auths(&[MockAuth {
        address: &payer,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "record_payment",
            args: (
                invoice_id.clone(),
                payer.clone(),
                String::from_str(&env, "XLM"),
                String::from_str(&env, ""),
                10_000_000i128,
                String::from_str(&env, "settle-unauth"),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // The host must reject because the required admin address never authorises.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-unauth"),
    );
    assert!(result.is_err());
}

#[test]
fn test_record_payment_succeeds_with_admin_auth() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-auth");
    let payer = Address::generate(&env);

    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "record_payment",
                args: (
                    invoice_id.clone(),
                    payer.clone(),
                    String::from_str(&env, "XLM"),
                    String::from_str(&env, ""),
                    10_000_000i128,
                    String::from_str(&env, "settle-auth"),
                )
                    .into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "set_allow_native",
                args: (true,).into_val(&env),
                sub_invokes: &[],
            },
        },
    ]);

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-auth"),
    );

    assert!(client.has_payment(&invoice_id));
}

#[test]
fn test_zero_amount_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-zero"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &0i128,
        &String::from_str(&env, "settle-zero"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_negative_amount_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-neg"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &(-1i128),
        &String::from_str(&env, "settle-neg"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

// has_payment

#[test]
fn test_has_payment_true_after_record() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-exists", &payer, 5_000_000);

    assert!(client.has_payment(&String::from_str(&env, "invoisio-exists")));
}

#[test]
fn test_has_payment_false_when_absent() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    assert!(!client.has_payment(&String::from_str(&env, "invoisio-ghost")));
}

// get_payment

#[test]
fn test_get_payment_absent_returns_error() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let result = client.try_get_payment(&String::from_str(&env, "invoisio-missing"));
    assert_eq!(result, Err(Ok(ContractError::PaymentNotFound)));
}

#[test]
fn test_get_payment_empty_invoice_id_returns_error() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let result = client.try_get_payment(&String::from_str(&env, ""));
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_get_payment_reads_and_migrates_legacy_key() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-legacy-001");
    let payer = Address::generate(&env);
    let legacy_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer,
        asset: Asset::Native,
        amount: 10_000_000i128,
        timestamp: 1234u64,
        settlement_ref: String::from_str(&env, "legacy"),
    };

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Payment(invoice_id.clone()), &legacy_record);
    });

    let loaded = client.get_payment(&invoice_id);
    assert_eq!(loaded, legacy_record);
    let migrated = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_id.clone()))
    });
    assert!(migrated);
}

#[test]
fn test_write_backfills_missing_version_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    env.as_contract(&client.address, || {
        env.storage().instance().remove(&DataKey::ContractMeta);
    });
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: 0,
            storage_schema_version: 0,
        }
    );

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-meta-backfill", &payer, 10_000_000);

    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );
}

// Admin management — explicit propose-and-accept handoff flow

#[test]
fn test_propose_and_accept_transfers_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, old_admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);

    // The role does NOT change until the proposed admin accepts.
    assert_eq!(client.admin(), old_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));
    assert_eq!(client.config().pending_admin, Some(new_admin.clone()));

    client.accept_admin(&new_admin);

    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.config().pending_admin, None);
}

#[test]
fn test_new_admin_can_record_payment_after_accept() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _old_admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);
    client.accept_admin(&new_admin);

    // With mock_all_auths the new admin's require_auth passes automatically.
    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-new-admin", &payer, 7_000_000);

    assert_eq!(client.payment_count(), 1);
}

#[test]
fn test_old_admin_loses_write_access_after_accept() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, old_admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);
    client.accept_admin(&new_admin);

    // The old admin is no longer the admin: their write must be rejected.
    let result = client.try_upgrade_storage(&old_admin);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_pending_admin_is_none_before_proposal() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.config().pending_admin, None);
}

#[test]
fn test_accept_admin_without_proposal_returns_no_pending_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let stranger = Address::generate(&env);
    let result = client.try_accept_admin(&stranger);
    assert_eq!(
        result,
        Err(Ok(ContractError::NoPendingAdmin)),
        "accept_admin with no pending proposal must return NoPendingAdmin"
    );
}

#[test]
fn test_propose_admin_twice_returns_pending_admin_exists() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let first = Address::generate(&env);
    client.propose_admin(&first);

    // A second proposal while one is already pending must be rejected.
    let second = Address::generate(&env);
    let result = client.try_propose_admin(&second);
    assert_eq!(
        result,
        Err(Ok(ContractError::PendingAdminExists)),
        "a second proposal while one is pending must return PendingAdminExists"
    );

    // The original proposal is unchanged.
    assert_eq!(client.pending_admin(), Some(first));
}

#[test]
fn test_propose_admin_rejects_current_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let result = client.try_propose_admin(&admin);
    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidProposedAdmin)),
        "proposing the current admin must return InvalidProposedAdmin"
    );
}

#[test]
fn test_cancel_admin_transfer_clears_pending_and_allows_repropose() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let first = Address::generate(&env);
    client.propose_admin(&first);
    assert_eq!(client.pending_admin(), Some(first.clone()));

    // Current admin cancels the pending proposal.
    client.cancel_admin_transfer();

    // The pending entry is gone.
    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.config().pending_admin, None);

    // Admin is unchanged.
    assert_eq!(client.admin(), admin);

    // A fresh proposal to a different address no longer hits PendingAdminExists.
    let second = Address::generate(&env);
    client.propose_admin(&second);
    assert_eq!(client.pending_admin(), Some(second));
}

#[test]
fn test_cancelled_proposal_cannot_be_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let proposed = Address::generate(&env);
    client.propose_admin(&proposed);
    client.cancel_admin_transfer();

    // The previously proposed address must not be able to claim the role.
    let result = client.try_accept_admin(&proposed);
    assert_eq!(
        result,
        Err(Ok(ContractError::NoPendingAdmin)),
        "a cancelled proposal must no longer be acceptable"
    );

    // And the admin role never moved.
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_cancel_admin_transfer_rejects_without_admin_auth() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    let proposed = Address::generate(&env);

    // Stage the admin's authorisation so the proposal itself can be created.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "propose_admin",
            args: (proposed.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.propose_admin(&proposed);
    assert_eq!(client.pending_admin(), Some(proposed.clone()));

    // Now only the PROPOSED address authorises the cancellation; the admin
    // (the only address allowed to cancel) does NOT.
    env.mock_auths(&[MockAuth {
        address: &proposed,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "cancel_admin_transfer",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // The host must reject because the required admin address never authorises.
    let result = client.try_cancel_admin_transfer();
    assert!(result.is_err());

    // The proposal is untouched.
    assert_eq!(client.pending_admin(), Some(proposed));
}

#[test]
fn test_cancel_admin_transfer_without_pending_returns_no_pending_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let result = client.try_cancel_admin_transfer();
    assert_eq!(
        result,
        Err(Ok(ContractError::NoPendingAdmin)),
        "cancel_admin_transfer with no pending proposal must return NoPendingAdmin"
    );
}

#[test]
fn test_cancel_then_accept_flow_recovers_admin_wedge() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    // Mistyped proposal staged.
    let mistyped = Address::generate(&env);
    client.propose_admin(&mistyped);

    // Re-propose is blocked until the explicit cancel happens.
    let intended = Address::generate(&env);
    let result = client.try_propose_admin(&intended);
    assert_eq!(result, Err(Ok(ContractError::PendingAdminExists)));

    // Cancel, then complete the handoff to the intended successor.
    client.cancel_admin_transfer();
    client.propose_admin(&intended);
    client.accept_admin(&intended);

    assert_eq!(client.admin(), intended);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_accept_admin_rejects_non_pending_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, old_admin) = setup(&env);

    let proposed = Address::generate(&env);
    client.propose_admin(&proposed);

    // A different address (not the proposed admin) attempts to accept.
    let attacker = Address::generate(&env);
    let result = client.try_accept_admin(&attacker);
    assert_eq!(
        result,
        Err(Ok(ContractError::Unauthorized)),
        "accept_admin by a non-proposed caller must return Unauthorized"
    );

    // The proposal is still intact and the admin is unchanged.
    assert_eq!(client.pending_admin(), Some(proposed));
    assert_eq!(client.admin(), old_admin);
}

// record_payment — invoice_id / asset validation

#[test]
fn test_empty_invoice_id_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, ""), // empty invoice_id
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-empty-inv"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_empty_asset_code_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-bad-asset"),
        &payer,
        &String::from_str(&env, ""), // empty asset_code
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-bad-asset"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_token_without_issuer_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    // USDC without an issuer must be rejected.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-no-issuer"),
        &payer,
        &String::from_str(&env, "USDC"),
        &String::from_str(&env, ""), // missing issuer for non-native asset
        &50_000_000i128,
        &String::from_str(&env, "settle-no-issuer"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

// Events

#[test]
fn test_record_payment_emits_payment_recorded_event() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-event-test");
    let payer = Address::generate(&env);

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-event-test"),
    );

    // env.events().all() returns events from the LAST contract invocation only.
    // We must assert BEFORE making any further contract call (e.g. get_payment),
    // otherwise the buffer is overwritten with that call's (empty) events.

    let inv_val: soroban_sdk::Val = invoice_id.into_val(&env);
    let pyr_val: soroban_sdk::Val = payer.into_val(&env);
    let code_val: soroban_sdk::Val = String::from_str(&env, "XLM").into_val(&env);
    let iss_val: soroban_sdk::Val = String::from_str(&env, "").into_val(&env);
    let amt_val: soroban_sdk::Val = 10_000_000i128.into_val(&env);
    let ref_val: soroban_sdk::Val = String::from_str(&env, "settle-event-test").into_val(&env);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "invoice_payment_recorded").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "invoice_id"), inv_val),
                    (Symbol::new(&env, "payer"), pyr_val),
                    (Symbol::new(&env, "asset_code"), code_val),
                    (Symbol::new(&env, "asset_issuer"), iss_val),
                    (Symbol::new(&env, "amount"), amt_val),
                    (Symbol::new(&env, "settlement_ref"), ref_val),
                    (Symbol::new(&env, "schema_version"), 1u32.into_val(&env))
                ]
                .into_val(&env),
            ),
        ]
    );
}

// Admin — propose/accept authorization

#[test]
fn test_propose_admin_requires_current_admin_auth() {
    let env = Env::default();
    let (client, _old_admin) = setup(&env);
    let new_admin = Address::generate(&env);

    // Only mock the current admin's auth — a proposal still needs admin auth.
    env.mock_auths(&[MockAuth {
        address: &new_admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "propose_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Without the current admin's auth the host must reject the call.
    let result = client.try_propose_admin(&new_admin);
    assert!(result.is_err());

    // The proposal was NOT staged by the unauthenticated call.
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_accept_admin_requires_proposed_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _old_admin) = setup(&env);
    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);

    // Only mock the current admin's auth — the proposed admin must accept.
    env.mock_auths(&[MockAuth {
        address: &new_admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "accept_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Correct auth: the proposed admin accepts the transfer.
    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_propose_admin_rejects_calls_from_non_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // The attacker (not the current admin) attempts to call propose_admin.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "propose_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_propose_admin(&new_admin);
    assert!(result.is_err());

    // No proposal was staged.
    assert_eq!(client.pending_admin(), None);

    // Sanity check: original admin is still the same when properly authorised.
    env.mock_all_auths();
    assert_eq!(client.admin(), admin);
}
// Multi-asset support tests

#[test]
fn test_asset_enum_native_xlm() {
    let native = Asset::Native;

    // Verify Native variant doesn't have code/issuer fields
    match native {
        Asset::Native => assert!(true), // Native variant exists
        Asset::Token(_, _) => panic!("Expected Native variant"),
    }
}

#[test]
fn test_asset_enum_token_with_code_and_issuer() {
    let env = Env::default();
    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    let token = Asset::Token(code.clone(), issuer.clone());

    match token {
        Asset::Token(c, i) => {
            assert_eq!(c, code);
            assert_eq!(i, issuer);
        }
        Asset::Native => panic!("Expected Token variant"),
    }
}

#[test]
fn test_record_payment_multiple_asset_types() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);

    // Allow tokens and native
    client.set_allow_native(&true);
    let usdc_code = String::from_str(&env, "USDC");
    let usdc_issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    client.allow_asset(&usdc_code, &usdc_issuer);
    let eurt_code = String::from_str(&env, "EURT");
    let eurt_issuer = String::from_str(
        &env,
        "GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S",
    );
    client.allow_asset(&eurt_code, &eurt_issuer);

    // Record XLM payment
    client.record_payment(
        &String::from_str(&env, "invoisio-xlm-001"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128, // 1 XLM
        &String::from_str(&env, "settle-multi-xlm"),
    );

    // Record USDC payment
    client.record_payment(
        &String::from_str(&env, "invoisio-usdc-001"),
        &payer,
        &usdc_code,
        &usdc_issuer,
        &50_000_000i128, // 5 USDC
        &String::from_str(&env, "settle-multi-usdc"),
    );

    // Record another token payment (e.g., EURT)
    client.record_payment(
        &String::from_str(&env, "invoisio-eurt-001"),
        &payer,
        &eurt_code,
        &eurt_issuer,
        &100_000_000i128, // 10 EURT
        &String::from_str(&env, "settle-multi-eurt"),
    );

    // Verify all payments were recorded with correct asset types
    let xlm_record = client.get_payment(&String::from_str(&env, "invoisio-xlm-001"));
    assert_eq!(xlm_record.asset, Asset::Native);

    let x_usdc_record = client.get_payment(&String::from_str(&env, "invoisio-usdc-001"));
    assert_eq!(x_usdc_record.asset, Asset::Token(usdc_code, usdc_issuer));

    let x_eurt_record = client.get_payment(&String::from_str(&env, "invoisio-eurt-001"));
    assert_eq!(x_eurt_record.asset, Asset::Token(eurt_code, eurt_issuer));

    // Verify payment count
    assert_eq!(client.payment_count(), 3);
}

#[test]
fn test_asset_validation_backward_compatibility() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);

    // Test that empty asset_code is still rejected
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-empty-asset"),
        &payer,
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-empty-asset"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Test that non-XLM asset without issuer is still rejected
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-no-issuer-2"),
        &payer,
        &String::from_str(&env, "BTC"),
        &String::from_str(&env, ""),
        &100_000_000i128,
        &String::from_str(&env, "settle-no-issuer-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Test that XLM with issuer is rejected (issuer must be empty for XLM)
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-xlm-with-issuer"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, "GABC123"),
        &10_000_000i128,
        &String::from_str(&env, "settle-xlm-issuer"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_asset_enum_serialization_deserialization() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let invoice_id = String::from_str(&env, "invoisio-serde-test");

    client.set_allow_native(&true);
    // Record a payment
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-serde-xlm"),
    );

    // Retrieve and verify the asset is correctly deserialized
    let record = client.get_payment(&invoice_id);
    assert_eq!(record.asset, Asset::Native);

    // Record a token payment
    let token_invoice_id = String::from_str(&env, "invoisio-token-serde-test");
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    client.set_allow_native(&true);
    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);

    client.record_payment(
        &token_invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &issuer,
        &50_000_000i128,
        &String::from_str(&env, "settle-serde-usdc"),
    );

    let token_record = client.get_payment(&token_invoice_id);
    match token_record.asset {
        Asset::Token(code, stored_issuer) => {
            assert_eq!(code, String::from_str(&env, "USDC"));
            assert_eq!(stored_issuer, issuer);
        }
        Asset::Native => panic!("Expected Token variant"),
    }
}

// Allowlist tests

#[test]
fn test_allowlist_enforcement() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let invoice_id = String::from_str(&env, "inv-1");
    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    // 1. Initially rejected
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-al-1"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow and succeed
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-al-2"),
    );
    assert!(client.has_payment(&invoice_id));

    // 3. Revoke and reject next one
    client.revoke_asset(&code, &issuer);
    let invoice_id_2 = String::from_str(&env, "inv-2");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-al-3"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));
}

#[test]
fn test_revoke_asset_empty_code_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "");
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    let result = client.try_revoke_asset(&code, &issuer);
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_revoke_asset_empty_issuer_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "");
    let result = client.try_revoke_asset(&code, &issuer);
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_native_allow_toggle() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let invoice_id = String::from_str(&env, "inv-native");
    let xlm = String::from_str(&env, "XLM");
    let empty = String::from_str(&env, "");

    // 1. Initially rejected (default is false)
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &xlm,
        &empty,
        &100i128,
        &String::from_str(&env, "settle-native-1"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow native and succeed
    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &xlm,
        &empty,
        &100i128,
        &String::from_str(&env, "settle-native-2"),
    );
    assert!(client.has_payment(&invoice_id));

    // 3. Block native and reject next
    client.set_allow_native(&false);
    let invoice_id_2 = String::from_str(&env, "inv-native-2");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer,
        &xlm,
        &empty,
        &100i128,
        &String::from_str(&env, "settle-native-3"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));
}

#[test]
fn test_config_reflects_allowlist_mode_changes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_allow_native(&true);

    assert_eq!(
        client.config(),
        ContractConfig {
            admin: Some(admin),
            pending_admin: None,
            initialized: true,
            version: ContractMeta {
                contract_version: CONTRACT_VERSION,
                storage_schema_version: STORAGE_SCHEMA_VERSION,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: true,
                requires_token_allowlist: true,
            },
            paused: false
        }
    );
}

#[test]
fn test_unauthorized_allowlist_calls_fail() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    // Attacker tries to allow asset
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "allow_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_allow_asset(&code, &issuer);
    assert!(result.is_err());

    // Attacker tries to set allow native
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_allow_native",
            args: (true,).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_set_allow_native(&true);
    assert!(result.is_err());
}

#[test]
fn test_allowlist_events_emitted() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    // 1. allow_asset event
    let code_val: soroban_sdk::Val = code.clone().into_val(&env);
    let issuer_val: soroban_sdk::Val = issuer.clone().into_val(&env);

    client.allow_asset(&code, &issuer);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![&env, Symbol::new(&env, "asset_allowlisted").into_val(&env)],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "code"), code_val),
                    (Symbol::new(&env, "issuer"), issuer_val)
                ]
                .into_val(&env)
            )
        ]
    );

    // 2. revoke_asset event
    let code_val: soroban_sdk::Val = code.clone().into_val(&env);
    let issuer_val: soroban_sdk::Val = issuer.clone().into_val(&env);

    client.revoke_asset(&code, &issuer);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![&env, Symbol::new(&env, "asset_revoked").into_val(&env)],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "code"), code_val),
                    (Symbol::new(&env, "issuer"), issuer_val)
                ]
                .into_val(&env)
            )
        ]
    );

    // 3. set_allow_native event
    let allowed_val: soroban_sdk::Val = true.into_val(&env);

    client.set_allow_native(&true);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "native_allow_changed").into_val(&env)
                ],
                soroban_sdk::map![&env, (Symbol::new(&env, "allowed"), allowed_val)].into_val(&env)
            )
        ]
    );
}

// Amount & asset boundary validation (issue #139)

#[test]
fn test_asset_code_too_long_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    // A 13-character asset code exceeds Stellar's 12-char maximum.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-long-code"),
        &payer,
        &String::from_str(&env, "ABCDEFGHIJKLM"), // 13 chars
        &String::from_str(
            &env,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        ),
        &10_000_000i128,
        &String::from_str(&env, "settle-long-code"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_asset_code_exactly_12_chars_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    let code = String::from_str(&env, "ABCDEFGHIJKL"); // exactly 12 chars
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    // A 12-char code is valid; allowlist it so it passes the allowlist guard.
    client.allow_asset(&code, &issuer);
    let invoice_id = String::from_str(&env, "invoisio-12-char-code");
    client.record_payment(
        &invoice_id,
        &payer,
        &code,
        &issuer,
        &50_000_000i128,
        &String::from_str(&env, "settle-12-char"),
    );
    assert!(client.has_payment(&invoice_id));
}

#[test]
fn test_amount_above_max_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    // One stroop above the i64::MAX boundary must be rejected.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-amount-too-big"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &(i64::MAX as i128 + 1),
        &String::from_str(&env, "settle-big-amount"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_amount_at_max_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let invoice_id = String::from_str(&env, "invoisio-amount-at-max");
    // Exactly i64::MAX is the largest allowed amount.
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &(i64::MAX as i128),
        &String::from_str(&env, "settle-max-amount"),
    );
    assert!(client.has_payment(&invoice_id));
}

// Upgrade compatibility tests
#[test]
fn test_multiple_legacy_payments_read_and_migrated() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let invoice_ids = soroban_sdk::vec![
        &env,
        String::from_str(&env, "invoisio-legacy-001"),
        String::from_str(&env, "invoisio-legacy-002"),
        String::from_str(&env, "invoisio-legacy-003"),
    ];
    let payer1 = Address::generate(&env);
    let payer2 = Address::generate(&env);
    let payer3 = Address::generate(&env);

    let record1 = PaymentRecord {
        invoice_id: invoice_ids.get(0).unwrap(),
        payer: payer1.clone(),
        asset: Asset::Native,
        amount: 10_000_000i128,
        timestamp: 1000u64,
        settlement_ref: String::from_str(&env, "legacy-001"),
    };
    let record2 = PaymentRecord {
        invoice_id: invoice_ids.get(1).unwrap(),
        payer: payer2.clone(),
        asset: Asset::Native,
        amount: 20_000_000i128,
        timestamp: 2000u64,
        settlement_ref: String::from_str(&env, "legacy-002"),
    };
    let record3 = PaymentRecord {
        invoice_id: invoice_ids.get(2).unwrap(),
        payer: payer3.clone(),
        asset: Asset::Native,
        amount: 30_000_000i128,
        timestamp: 3000u64,
        settlement_ref: String::from_str(&env, "legacy-003"),
    };

    // Write all records to legacy keys
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Payment(record1.invoice_id.clone()), &record1);
        env.storage()
            .persistent()
            .set(&DataKey::Payment(record2.invoice_id.clone()), &record2);
        env.storage()
            .persistent()
            .set(&DataKey::Payment(record3.invoice_id.clone()), &record3);
    });

    // Read all payments and verify they are loaded correctly
    let loaded1 = client.get_payment(&invoice_ids.get(0).unwrap());
    assert_eq!(loaded1, record1);
    let loaded2 = client.get_payment(&invoice_ids.get(1).unwrap());
    assert_eq!(loaded2, record2);
    let loaded3 = client.get_payment(&invoice_ids.get(2).unwrap());
    assert_eq!(loaded3, record3);

    // Verify all were migrated to v1 keys
    let migrated1 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_ids.get(0).unwrap().clone()))
    });
    assert!(migrated1);
    let migrated2 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_ids.get(1).unwrap().clone()))
    });
    assert!(migrated2);
    let migrated3 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_ids.get(2).unwrap().clone()))
    });
    assert!(migrated3);
}

#[test]
fn test_mixed_legacy_and_new_payments() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    // Create a legacy payment
    let legacy_invoice_id = String::from_str(&env, "invoisio-legacy-mix");
    let legacy_payer = Address::generate(&env);
    let legacy_record = PaymentRecord {
        invoice_id: legacy_invoice_id.clone(),
        payer: legacy_payer.clone(),
        asset: Asset::Native,
        amount: 10_000_000,
        timestamp: 1234,
        settlement_ref: String::from_str(&env, "legacy-mix"),
    };
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Payment(legacy_invoice_id.clone()), &legacy_record);
    });

    // Record a new payment
    let new_invoice_id = String::from_str(&env, "invoisio-new-mix");
    let new_payer = Address::generate(&env);
    client.set_allow_native(&true);
    client.record_payment(
        &new_invoice_id,
        &new_payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000,
        &String::from_str(&env, "settle-new-mix"),
    );

    // Verify both are readable
    let loaded_legacy = client.get_payment(&legacy_invoice_id);
    assert_eq!(loaded_legacy, legacy_record);
    let loaded_new = client.get_payment(&new_invoice_id);
    assert_eq!(loaded_new.invoice_id, new_invoice_id);
    assert_eq!(loaded_new.amount, 20_000_000);

    // Verify legacy was migrated
    let migrated = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(legacy_invoice_id.clone()))
    });
    assert!(migrated);
}

#[test]
fn test_legacy_deployment_without_metadata_then_write() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Simulate a legacy deployment that initialized admin and payment count,
    // but didn't set ContractMeta
    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
    });

    // Check initial version info
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: 0,
            storage_schema_version: 0,
        }
    );

    // Perform a write operation which should backfill metadata
    let payer = Address::generate(&env);
    env.mock_all_auths();
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(&env, "invoisio-legacy-deploy"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000,
        &String::from_str(&env, "settle-legacy-deploy"),
    );

    // Now metadata should be present and current
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );
}

// ─── Storage Schema Migration Tests ────────────────────────────────────────

#[test]
fn test_upgrade_storage_schema_v0_to_v1() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Simulate legacy deployment (schema version 0)
    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        // No ContractMeta set = legacy deployment
    });

    // Verify schema version is 0
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: 0,
            storage_schema_version: 0,
        }
    );

    // Upgrade storage schema
    env.mock_all_auths();
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    // Verify schema version is now current
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );
}

#[test]
fn test_upgrade_storage_preserves_payment_records() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Simulate legacy deployment with payments
    let invoice_id = String::from_str(&env, "invoisio-legacy-migration");
    let payer = Address::generate(&env);
    let legacy_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer: payer.clone(),
        asset: Asset::Native,
        amount: 10_000_000i128,
        timestamp: 1234u64,
        settlement_ref: String::from_str(&env, "legacy-migration"),
    };

    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        env.storage()
            .persistent()
            .set(&DataKey::Payment(invoice_id.clone()), &legacy_record);
    });

    // Verify record exists in legacy format
    let loaded = client.get_payment(&invoice_id);
    assert_eq!(loaded, legacy_record);

    // Upgrade storage
    env.mock_all_auths();
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    // Verify record is still readable and migrated
    let migrated = client.get_payment(&invoice_id);
    assert_eq!(migrated, legacy_record);

    // Verify it was migrated to v1 key
    let has_v1 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_id.clone()))
    });
    assert!(has_v1);
}

#[test]
fn test_upgrade_storage_only_admin_can_call() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);

    // Attacker tries to upgrade storage
    let result = client.try_upgrade_storage(&attacker);
    assert!(result.is_err());

    // Admin can upgrade
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());
}

#[test]
fn test_upgrade_storage_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // First upgrade
    let result1 = client.try_upgrade_storage(&admin);
    assert!(result1.is_ok());

    // Second upgrade (should be idempotent)
    let result2 = client.try_upgrade_storage(&admin);
    assert!(result2.is_ok());
}

#[test]
fn test_schema_compatibility_check() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    // Wrap the storage access in as_contract
    let compatible = env.as_contract(&client.address, || storage::is_schema_compatible(&env));
    assert!(compatible);

    // Version info should match current
    let info = client.version_info();
    assert_eq!(info.storage_schema_version, STORAGE_SCHEMA_VERSION);
}

// ─── Pause Tests ────────────────────────────────────────────────────────────

#[test]
fn test_pause_prevents_record_payment() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Pause the contract
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // Try to record a payment - should fail
    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-paused"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-paused"),
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    // Unpause
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());

    // Now record should succeed
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(&env, "invoisio-unpaused"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-unpaused"),
    );
    assert_eq!(client.payment_count(), 1);
}

#[test]
fn test_pause_allows_reads() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Record a payment first
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(&env, "invoisio-read-test"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-read-test"),
    );

    // Pause the contract
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // All read operations should still work
    assert!(client.has_payment(&String::from_str(&env, "invoisio-read-test")));
    assert_eq!(client.payment_count(), 1);
    assert!(
        client
            .get_payment(&String::from_str(&env, "invoisio-read-test"))
            .invoice_id
            .len()
            > 0
    );
    assert_eq!(client.payment_history(&0u32, &10u32).records.len(), 1);
}

#[test]
fn test_pause_only_admin_can_call() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);

    // Attacker tries to pause
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &attacker,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_paused",
            args: (true,).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_set_paused(&attacker, &true);
    assert!(result.is_err());

    // Admin can pause
    env.mock_all_auths();
    let result = client.try_set_paused(&admin, &true);
    assert!(result.is_ok());
}

#[test]
fn test_pause_event_emitted() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Pause
    client.set_paused(&admin, &true);
    assert_eq!(
        env.events().all().events().len(),
        1,
        "Pause event should be emitted"
    );

    // Unpause
    client.set_paused(&admin, &false);
    assert_eq!(
        env.events().all().events().len(),
        1,
        "Unpause event should be emitted"
    );
}

// Admin transfer events

#[test]
fn test_propose_admin_emits_admin_transfer_proposed_event() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);

    let admin_val: soroban_sdk::Val = admin.into_val(&env);
    let new_admin_val: soroban_sdk::Val = new_admin.into_val(&env);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "admin_transfer_proposed").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "current_admin"), admin_val),
                    (Symbol::new(&env, "new_admin"), new_admin_val),
                    (
                        Symbol::new(&env, "timestamp"),
                        env.ledger().timestamp().into_val(&env)
                    )
                ]
                .into_val(&env),
            ),
        ]
    );
}

#[test]
fn test_accept_admin_emits_admin_transfer_accepted_event() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);
    client.accept_admin(&new_admin);

    let admin_val: soroban_sdk::Val = admin.into_val(&env);
    let new_admin_val: soroban_sdk::Val = new_admin.into_val(&env);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "admin_transfer_accepted").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "previous_admin"), admin_val),
                    (Symbol::new(&env, "new_admin"), new_admin_val),
                    (
                        Symbol::new(&env, "timestamp"),
                        env.ledger().timestamp().into_val(&env)
                    )
                ]
                .into_val(&env),
            ),
        ]
    );
}

#[test]
fn test_config_includes_paused_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let config = client.config();
    assert!(!config.paused);

    client.set_paused(&admin, &true);
    let config = client.config();
    assert!(config.paused);
}

// ─── settlement_ref Tests ─────────────────────────────────────────────────

#[test]
fn test_record_payment_with_settlement_ref_stores_and_returns() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-settle-001");
    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "sha256-abcdef1234567890");

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.settlement_ref, settlement_ref);
}

#[test]
fn test_empty_settlement_ref_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-empty-ref"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, ""), // empty settlement_ref
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

#[test]
fn test_settlement_ref_too_long_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    // 129 chars exceeds the 128-char limit
    let long_ref = String::from_str(
        &env,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-long-ref"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &long_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

#[test]
fn test_settlement_ref_exactly_128_chars_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    // Exactly 128 chars — should be accepted
    let ref_128 = String::from_str(
        &env,
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    );
    let invoice_id = String::from_str(&env, "invoisio-ref-128");
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &ref_128,
    );
    let record = client.get_payment(&invoice_id);
    assert_eq!(record.settlement_ref, ref_128);
}

#[test]
fn test_settlement_ref_emitted_in_event() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Symbol;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-ref-event");
    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "settle-hash-abc123");

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    let inv_val: soroban_sdk::Val = invoice_id.into_val(&env);
    let pyr_val: soroban_sdk::Val = payer.into_val(&env);
    let code_val: soroban_sdk::Val = String::from_str(&env, "XLM").into_val(&env);
    let iss_val: soroban_sdk::Val = String::from_str(&env, "").into_val(&env);
    let amt_val: soroban_sdk::Val = 10_000_000i128.into_val(&env);
    let ref_val: soroban_sdk::Val = settlement_ref.clone().into_val(&env);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "invoice_payment_recorded").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "invoice_id"), inv_val),
                    (Symbol::new(&env, "payer"), pyr_val),
                    (Symbol::new(&env, "asset_code"), code_val),
                    (Symbol::new(&env, "asset_issuer"), iss_val),
                    (Symbol::new(&env, "amount"), amt_val),
                    (Symbol::new(&env, "settlement_ref"), ref_val),
                    (Symbol::new(&env, "schema_version"), 1u32.into_val(&env))
                ]
                .into_val(&env),
            ),
        ]
    );
}

#[test]
fn test_settlement_ref_usdc_payment() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-settle-usdc");
    let payer = Address::generate(&env);
    let issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &issuer,
        &50_000_000i128,
        &String::from_str(&env, "settle-usdc-hash-789"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(
        record.settlement_ref,
        String::from_str(&env, "settle-usdc-hash-789")
    );
}

// ─── Regression Tests: Allowlist Add/Revoke Edge Cases ───────────────────────

/// Re-adding an already-allowed asset must be idempotent: the second
/// `allow_asset` call overwrites the same persistent key with the same unit
/// value. After re-allowing, payments with that asset must still succeed.
#[test]
fn test_allow_asset_idempotent_double_allow() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer1");

    // First allow — no error expected.
    client.allow_asset(&code, &issuer);

    // Second allow of the exact same asset — must not error.
    client.allow_asset(&code, &issuer);

    // Asset is still in the allowlist: a payment should succeed.
    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "inv-double-allow"),
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-double-allow"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-double-allow")));
}

/// Re-adding an asset that was previously revoked must restore it to the
/// allowlist.  A payment that failed after revocation must succeed after
/// re-allowing.
#[test]
fn test_allow_asset_after_revoke_restores_allowlist() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "EURT");
    let issuer = String::from_str(&env, "GBEurtIssuer");
    let payer = Address::generate(&env);

    // 1. Allow → payment succeeds.
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-readd-1"),
        &payer,
        &code,
        &issuer,
        &200i128,
        &String::from_str(&env, "settle-readd-1"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-readd-1")));

    // 2. Revoke → next payment must fail.
    client.revoke_asset(&code, &issuer);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-readd-2"),
        &payer,
        &code,
        &issuer,
        &200i128,
        &String::from_str(&env, "settle-readd-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 3. Re-allow → payment must succeed again.
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-readd-3"),
        &payer,
        &code,
        &issuer,
        &300i128,
        &String::from_str(&env, "settle-readd-3"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-readd-3")));
}

/// Revoking an asset that was never added must be a silent no-op.
/// `storage.persistent().remove()` on a non-existent key does not panic;
/// the function must return `Ok(())` and no error should propagate.
#[test]
fn test_revoke_asset_nonexistent_is_noop() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "PHANTOM");
    let issuer = String::from_str(&env, "GBPhantomIssuer");

    // This asset was never added — revoke must succeed without error.
    let result = client.try_revoke_asset(&code, &issuer);
    assert!(
        result.is_ok(),
        "revoking a non-existent asset must be a no-op"
    );

    // The allowlist state is still empty: a payment attempt must be rejected.
    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-phantom"),
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-phantom"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));
}

/// Revoking the same asset twice must be idempotent — the second call must
/// not error even though the key is already absent.
#[test]
fn test_revoke_asset_idempotent_double_revoke() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer2");

    // Add, then revoke once — standard path.
    client.allow_asset(&code, &issuer);
    client.revoke_asset(&code, &issuer);

    // Second revoke of the same (now absent) asset must not error.
    let result = client.try_revoke_asset(&code, &issuer);
    assert!(result.is_ok(), "double-revoke must be idempotent");
}

/// Calling `allow_asset` before `initialize()` must return
/// [`ContractError::NotInitialized`] because `get_admin` fails first.
#[test]
fn test_allow_asset_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    let result = client.try_allow_asset(&code, &issuer);
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "allow_asset on uninitialised contract must return NotInitialized"
    );
}

/// Calling `revoke_asset` before `initialize()` must return
/// [`ContractError::NotInitialized`].
#[test]
fn test_revoke_asset_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    let result = client.try_revoke_asset(&code, &issuer);
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "revoke_asset on uninitialised contract must return NotInitialized"
    );
}

/// An unauthorized caller (not the admin) must not be able to `allow_asset`.
/// The returned error must be the host auth rejection, not a generic panic,
/// satisfying the requirement for stable error assertions.
#[test]
fn test_allow_asset_by_non_admin_returns_error() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "allow_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_allow_asset(&code, &issuer);
    assert!(result.is_err(), "non-admin must not be able to allow_asset");
}

/// An unauthorized caller must not be able to `revoke_asset`.
#[test]
fn test_revoke_asset_by_non_admin_returns_error() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuer");

    // Admin allows the asset first.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "allow_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.allow_asset(&code, &issuer);

    // Attacker tries to revoke.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "revoke_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_revoke_asset(&code, &issuer);
    assert!(
        result.is_err(),
        "non-admin must not be able to revoke_asset"
    );
}

// ─── Regression Tests: Native-Asset Policy ───────────────────────────────────

/// Calling `set_allow_native` before `initialize()` must return
/// [`ContractError::NotInitialized`].
#[test]
fn test_set_allow_native_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let result = client.try_set_allow_native(&true);
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "set_allow_native on uninitialised contract must return NotInitialized"
    );
}

/// Setting native allowed from `true` to `true` again must be idempotent.
/// The flag remains `true` and payments continue to succeed.
#[test]
fn test_set_allow_native_idempotent_true_to_true() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    // Setting again to true must not error and must leave flag set.
    let result = client.try_set_allow_native(&true);
    assert!(
        result.is_ok(),
        "set_allow_native(true→true) must be idempotent"
    );

    let config = client.config();
    assert!(
        config.allowlist_mode.native_allowed,
        "native_allowed must still be true"
    );

    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "inv-native-idempotent-true"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-native-idempotent-true"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-native-idempotent-true")));
}

/// Setting native allowed from `false` to `false` again must be idempotent.
/// The flag stays `false` and XLM payments continue to be rejected.
#[test]
fn test_set_allow_native_idempotent_false_to_false() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    // Default is false; set explicitly to false once more.
    let result = client.try_set_allow_native(&false);
    assert!(
        result.is_ok(),
        "set_allow_native(false→false) must be idempotent"
    );

    let config = client.config();
    assert!(
        !config.allowlist_mode.native_allowed,
        "native_allowed must remain false"
    );

    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-native-idempotent-false"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-native-idempotent-false"),
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::AssetNotAllowed)),
        "XLM must remain rejected when native_allowed is false"
    );
}

/// When the contract is paused, XLM payments must be rejected with
/// [`ContractError::ContractPaused`], not [`ContractError::AssetNotAllowed`].
/// The pause check runs before the allowlist check in `record_payment`.
#[test]
fn test_native_asset_rejected_when_contract_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Allow native and verify a baseline payment would succeed while unpaused.
    client.set_allow_native(&true);
    client.set_paused(&admin, &true);

    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-native-paused"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-native-paused"),
    );
    // The pause check fires first, so the error must be ContractPaused, not
    // AssetNotAllowed — even though native is explicitly allowed.
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "pause must fire before allowlist check — error must be ContractPaused"
    );
}

/// `config().allowlist_mode.native_allowed` must track `set_allow_native`
/// across multiple toggles so operators can inspect the live state.
#[test]
fn test_native_policy_reflected_in_config_across_toggles() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    assert!(
        !client.config().allowlist_mode.native_allowed,
        "default native_allowed must be false"
    );

    client.set_allow_native(&true);
    assert!(
        client.config().allowlist_mode.native_allowed,
        "native_allowed must be true after set_allow_native(true)"
    );

    client.set_allow_native(&false);
    assert!(
        !client.config().allowlist_mode.native_allowed,
        "native_allowed must be false after set_allow_native(false)"
    );

    client.set_allow_native(&true);
    assert!(
        client.config().allowlist_mode.native_allowed,
        "native_allowed must be true after second set_allow_native(true)"
    );
}

/// An unauthorized caller must not be able to toggle the native-asset flag.
/// The error should not be a generic panic — it must be a proper auth failure.
#[test]
fn test_set_allow_native_by_non_admin_returns_error() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_allow_native",
            args: (true,).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_set_allow_native(&true);
    assert!(
        result.is_err(),
        "non-admin must not be able to call set_allow_native"
    );

    // Flag must remain unchanged (default false).
    // We need admin auth to read config — use mock_all_auths for the read.
    env.mock_all_auths();
    assert!(
        !client.config().allowlist_mode.native_allowed,
        "native_allowed must remain false after unauthorized attempt"
    );
}

// ─── Regression Tests: Paused-State Write Rejection ──────────────────────────

/// Pausing an already-paused contract must be idempotent.
/// The call must succeed and `is_paused()` must still return `true`.
#[test]
fn test_set_paused_double_pause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // Second pause — must not error.
    let result = client.try_set_paused(&admin, &true);
    assert!(result.is_ok(), "double-pause must be idempotent");
    assert!(client.is_paused(), "contract must remain paused");
}

/// Unpausing an already-unpaused contract must be idempotent.
#[test]
fn test_set_paused_double_unpause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Default is unpaused; explicitly unpause again.
    let result = client.try_set_paused(&admin, &false);
    assert!(result.is_ok(), "double-unpause must be idempotent");
    assert!(!client.is_paused(), "contract must remain unpaused");
}

/// While the contract is paused, `allow_asset` must still succeed because
/// the pause flag only blocks `record_payment`.  Admin-only config writes
/// remain available so an operator can fix allowlist entries while paused.
#[test]
fn test_allow_asset_works_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuerPaused");

    // allow_asset must succeed even while paused.
    let result = client.try_allow_asset(&code, &issuer);
    assert!(
        result.is_ok(),
        "allow_asset must work while contract is paused"
    );
}

/// While paused, `revoke_asset` must still succeed.
#[test]
fn test_revoke_asset_works_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuerRevokePaused");
    client.allow_asset(&code, &issuer);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // revoke_asset must succeed even while paused.
    let result = client.try_revoke_asset(&code, &issuer);
    assert!(
        result.is_ok(),
        "revoke_asset must work while contract is paused"
    );
}

/// While paused, `set_allow_native` must still succeed.
#[test]
fn test_set_allow_native_works_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let result = client.try_set_allow_native(&true);
    assert!(
        result.is_ok(),
        "set_allow_native must work while contract is paused"
    );
    assert!(
        client.config().allowlist_mode.native_allowed,
        "native_allowed should reflect the change made while paused"
    );
}

/// While paused, the propose-and-accept admin handoff must still succeed
/// (it is not a payment write).
#[test]
fn test_admin_transfer_works_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let new_admin = Address::generate(&env);
    let propose = client.try_propose_admin(&new_admin);
    assert!(
        propose.is_ok(),
        "propose_admin must work while contract is paused"
    );
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    let accept = client.try_accept_admin(&new_admin);
    assert!(
        accept.is_ok(),
        "accept_admin must work while contract is paused"
    );
    assert_eq!(
        client.admin(),
        new_admin,
        "admin must be updated while paused"
    );
}

/// `record_payment` must return [`ContractError::ContractPaused`] specifically,
/// not a generic error.  This makes error assertions stable and documentable.
#[test]
fn test_record_payment_paused_returns_contract_paused_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_allow_native(&true);
    client.set_paused(&admin, &true);

    let payer = Address::generate(&env);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-paused-explicit"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, "settle-paused-explicit"),
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "paused record_payment must return ContractPaused, not a generic error"
    );
}

/// After unpausing, `record_payment` must succeed immediately — the unpause
/// takes effect for the very next call.
#[test]
fn test_unpause_resumes_record_payment() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_allow_native(&true);
    client.set_paused(&admin, &true);

    // Confirm paused state rejects writes.
    let payer = Address::generate(&env);
    let blocked = client.try_record_payment(
        &String::from_str(&env, "inv-resume-blocked"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-resume-blocked"),
    );
    assert_eq!(blocked, Err(Ok(ContractError::ContractPaused)));

    // Unpause.
    client.set_paused(&admin, &false);

    // Now the same invoice_id write must succeed.
    client.record_payment(
        &String::from_str(&env, "inv-resume-blocked"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-resume-unblocked"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-resume-blocked")));
}

/// `set_paused` before `initialize()` must return
/// [`ContractError::NotInitialized`] because `get_admin` is the first check.
#[test]
fn test_set_paused_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);
    let caller = Address::generate(&env);

    let result = client.try_set_paused(&caller, &true);
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "set_paused on uninitialised contract must return NotInitialized"
    );
}

// ─── Regression Tests: Unauthorized Admin Operations ─────────────────────────

/// A non-admin address calling `set_paused` must get a host auth error.
/// This upgrades the generic `is_err()` check to an explicit assertion.
#[test]
fn test_set_paused_by_non_admin_explicit_error() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    // The attacker provides their own auth, but they are not the admin.
    // The contract first calls get_admin() successfully, then checks
    // caller == admin — but the host auth check fires because attacker's
    // `require_auth()` is satisfied while admin's is not required by the mock.
    // Either the host or the contract will reject; the result must be Err.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_paused",
            args: (attacker.clone(), true).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_set_paused(&attacker, &true);
    assert!(result.is_err(), "non-admin set_paused must be rejected");
    // Contract must remain unpaused after the failed attempt.
    assert!(
        !client.is_paused(),
        "contract must not be paused after unauthorized attempt"
    );
}

/// A non-admin address calling `set_paused` where the contract explicitly
/// checks `caller != admin` must return [`ContractError::Unauthorized`].
#[test]
fn test_set_paused_wrong_caller_returns_unauthorized() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    // Mock both the attacker's auth AND the admin's auth so the host auth
    // passes, but the contract's `caller != admin` check still fires.
    env.mock_all_auths();

    let result = client.try_set_paused(&attacker, &true);
    assert_eq!(
        result,
        Err(Ok(ContractError::Unauthorized)),
        "wrong caller for set_paused must return ContractError::Unauthorized"
    );
}

/// Calling `propose_admin` / `accept_admin` before `initialize()` must return
/// [`ContractError::NotInitialized`] with an explicit error code assertion.
#[test]
fn test_admin_transfer_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);
    let new_admin = Address::generate(&env);

    let propose = client.try_propose_admin(&new_admin);
    assert_eq!(
        propose,
        Err(Ok(ContractError::NotInitialized)),
        "propose_admin on uninitialised contract must return NotInitialized"
    );

    let accept = client.try_accept_admin(&new_admin);
    assert_eq!(
        accept,
        Err(Ok(ContractError::NotInitialized)),
        "accept_admin on uninitialised contract must return NotInitialized"
    );
}

/// Calling `record_payment` before `initialize()` must return
/// [`ContractError::NotInitialized`] because the pause check happens after
/// `get_admin` (which fails first when the contract is uninitialised).
#[test]
fn test_record_payment_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);
    let payer = Address::generate(&env);

    // Note: is_paused check runs first (returns false since storage is empty),
    // then get_admin() returns NotInitialized.
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-uninit"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "settle-uninit"),
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "record_payment on uninitialised contract must return NotInitialized"
    );
}

/// `upgrade_storage` called by a non-admin must return
/// [`ContractError::Unauthorized`], not a generic error.
#[test]
fn test_upgrade_storage_non_admin_returns_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_upgrade_storage(&attacker);
    assert_eq!(
        result,
        Err(Ok(ContractError::Unauthorized)),
        "upgrade_storage by non-admin must return ContractError::Unauthorized"
    );
}

/// `admin()` before `initialize()` must return
/// [`ContractError::NotInitialized`] with an explicit error assertion.
#[test]
fn test_admin_before_init_returns_not_initialized() {
    let env = Env::default();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let result = client.try_admin();
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "admin() on uninitialised contract must return NotInitialized"
    );
}

/// The existing `test_unauthorized_allowlist_calls_fail` uses `is_err()`
/// generically.  This test upgrades to explicit error-type assertions for
/// `allow_asset` by mocking the admin auth but using the wrong (attacker) address.
///
/// When `mock_all_auths` is active, host auth succeeds for anyone, so the
/// contract's internal `admin.require_auth()` passes.  The real rejection
/// must come from the host refusing a non-admin caller's auth in a stricter mock.
#[test]
fn test_allow_asset_explicit_auth_rejection() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = String::from_str(&env, "GBIssuerExplicit");

    // Only attacker provides auth — admin's `require_auth()` is unsatisfied.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "allow_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_allow_asset(&code, &issuer);
    // Host auth failure is not a ContractError; it is a host-level error.
    // We assert is_err() here, which is stable — the point is that it must fail.
    assert!(
        result.is_err(),
        "allow_asset with wrong auth must be rejected"
    );

    // Confirm the asset was NOT actually added by checking a payment still fails.
    env.mock_all_auths();
    let payer = Address::generate(&env);
    let pay_result = client.try_record_payment(
        &String::from_str(&env, "inv-explicit-auth"),
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-explicit-auth"),
    );
    assert_eq!(
        pay_result,
        Err(Ok(ContractError::AssetNotAllowed)),
        "asset must not be in allowlist after unauthorized allow_asset attempt"
    );
}

/// Comprehensive scenario: attacker cannot manipulate allowlist or pause state,
/// ensuring contract regressions in auth logic are caught by a single end-to-end path.
#[test]
fn test_unauthorized_ops_cannot_modify_contract_state() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);

    let code = String::from_str(&env, "HCKR");
    let issuer = String::from_str(&env, "GBHackerIssuer");

    // --- All attacker operations below must fail ---

    // 1. Attacker tries to allow_asset.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "allow_asset",
            args: (code.clone(), issuer.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_allow_asset(&code, &issuer).is_err());

    // 2. Attacker tries to set_allow_native.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_allow_native",
            args: (true,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_set_allow_native(&true).is_err());

    // 3. Attacker tries to set_paused with mock_all_auths (wrong caller).
    env.mock_all_auths();
    let paused_result = client.try_set_paused(&attacker, &true);
    assert_eq!(
        paused_result,
        Err(Ok(ContractError::Unauthorized)),
        "wrong-caller set_paused must return Unauthorized"
    );

    // 4. Attacker tries to upgrade_storage.
    let upgrade_result = client.try_upgrade_storage(&attacker);
    assert_eq!(
        upgrade_result,
        Err(Ok(ContractError::Unauthorized)),
        "non-admin upgrade_storage must return Unauthorized"
    );

    // --- Verify state is completely unchanged ---

    let config = client.config();
    assert!(
        !config.allowlist_mode.native_allowed,
        "native_allowed must still be false"
    );
    assert!(!config.paused, "contract must still be unpaused");
    assert_eq!(config.admin, Some(admin), "admin must be unchanged");

    // HCKR asset must not be in the allowlist.
    let payer = Address::generate(&env);
    let pay_result = client.try_record_payment(
        &String::from_str(&env, "inv-hacker"),
        &payer,
        &code,
        &issuer,
        &100i128,
        &String::from_str(&env, "settle-hacker"),
    );
    assert_eq!(
        pay_result,
        Err(Ok(ContractError::AssetNotAllowed)),
        "attacker-added asset must not appear in allowlist"
    );
}

// ─── Storage Upgrade Compatibility Regression Tests (issue #299) ─────────────

/// Simulate a full V0→V1 upgrade cycle: seed legacy payment data under V0 keys,
/// upgrade storage, then verify every payment is readable, migrated to V1 keys,
/// and the history index is intact.
#[test]
fn test_regression_upgrade_preserves_multiple_legacy_payments_and_history() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // 1. Seed legacy V0 state: admin + 3 payments under legacy keys, no metadata.
    let invoices: soroban_sdk::Vec<String> = soroban_sdk::vec![
        &env,
        String::from_str(&env, "reg-001"),
        String::from_str(&env, "reg-002"),
        String::from_str(&env, "reg-003"),
    ];
    let payers: soroban_sdk::Vec<Address> = soroban_sdk::vec![
        &env,
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let records: soroban_sdk::Vec<PaymentRecord> = soroban_sdk::vec![
        &env,
        PaymentRecord {
            invoice_id: invoices.get(0).unwrap(),
            payer: payers.get(0).unwrap(),
            asset: Asset::Native,
            amount: 5_000_000i128,
            timestamp: 100u64,
            settlement_ref: String::from_str(&env, "reg-ref-001"),
        },
        PaymentRecord {
            invoice_id: invoices.get(1).unwrap(),
            payer: payers.get(1).unwrap(),
            asset: Asset::Token(
                String::from_str(&env, "USDC"),
                String::from_str(&env, "GBIssuer"),
            ),
            amount: 100_000_000i128,
            timestamp: 200u64,
            settlement_ref: String::from_str(&env, "reg-ref-002"),
        },
        PaymentRecord {
            invoice_id: invoices.get(2).unwrap(),
            payer: payers.get(2).unwrap(),
            asset: Asset::Native,
            amount: 15_000_000i128,
            timestamp: 300u64,
            settlement_ref: String::from_str(&env, "reg-ref-003"),
        },
    ];

    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        for i in 0..3u32 {
            env.storage().persistent().set(
                &DataKey::Payment(records.get(i).unwrap().invoice_id.clone()),
                &records.get(i).unwrap(),
            );
        }
    });

    // 2. Verify V0 state: version_info shows legacy, payments exist under legacy keys.
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: 0,
            storage_schema_version: 0,
        }
    );
    for i in 0..3u32 {
        let inv = records.get(i).unwrap().invoice_id.clone();
        assert!(client.has_payment(&inv));
        let loaded = client.get_payment(&inv);
        assert_eq!(loaded, records.get(i).unwrap());
    }

    // 3. Upgrade storage schema.
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    // 4. Verify schema version updated.
    assert_eq!(
        client.version_info(),
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );

    // 5. Verify all payments readable and migrated to V1 keys.
    for i in 0..3u32 {
        let inv = records.get(i).unwrap().invoice_id.clone();
        let loaded = client.get_payment(&inv);
        assert_eq!(loaded, records.get(i).unwrap());

        let has_v1 = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(inv.clone()))
        });
        assert!(has_v1, "payment must be migrated to V1 key");
    }

    // 6. Record a new payment after upgrade — must succeed and use V1 key.
    let new_payer = Address::generate(&env);
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(&env, "reg-new-001"),
        &new_payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &7_000_000i128,
        &String::from_str(&env, "reg-new-ref"),
    );
    assert_eq!(client.payment_count(), 1);
    let has_v1 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(String::from_str(&env, "reg-new-001")))
    });
    assert!(has_v1, "new payment must be stored under V1 key");
}

/// After upgrading from V0, the config view must reflect the correct admin,
/// initialized state, version metadata, and allowlist defaults.
#[test]
fn test_regression_config_after_upgrade_reflects_all_fields() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
    });

    env.mock_all_auths();
    client.upgrade_storage(&admin);

    let config = client.config();
    assert_eq!(config.admin, Some(admin));
    assert!(config.initialized);
    assert_eq!(
        config.version,
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        }
    );
    assert!(!config.allowlist_mode.native_allowed);
    assert!(config.allowlist_mode.requires_token_allowlist);
    assert!(!config.paused);
}

/// Admin transfer (propose + accept) must work correctly after a schema upgrade,
/// and the new admin must be able to call record_payment and upgrade_storage.
#[test]
fn test_regression_admin_controls_after_upgrade() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Seed legacy state.
    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
    });

    // Upgrade.
    client.upgrade_storage(&admin);

    // Propose new admin.
    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));
    assert_eq!(client.admin(), admin);

    // Accept.
    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);

    // New admin can record payment.
    let payer = Address::generate(&env);
    record_xlm(&env, &client, "reg-admin-new", &payer, 1_000_000);
    assert!(client.has_payment(&String::from_str(&env, "reg-admin-new")));

    // New admin can upgrade storage (idempotent).
    let result = client.try_upgrade_storage(&new_admin);
    assert!(result.is_ok());

    // Old admin cannot record payments or upgrade.
    let result = client.try_upgrade_storage(&admin);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

/// Upgrade_storage must emit a StorageSchemaUpgraded event with correct from/to
/// versions and a valid timestamp. Subsequent idempotent calls must NOT emit
/// another event.
#[test]
fn test_regression_upgrade_storage_schema_upgraded_event_emitted() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Seed legacy V0 state.
    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
    });

    env.mock_all_auths();

    // First upgrade — must emit StorageSchemaUpgraded(0 → 1).
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    let events = env.events().all();
    assert_eq!(events.events().len(), 1);

    // Second upgrade (idempotent) — must NOT emit another event.
    let result2 = client.try_upgrade_storage(&admin);
    assert!(result2.is_ok());
    let events2 = env.events().all();
    assert_eq!(
        events2.events().len(),
        0,
        "idempotent upgrade must not emit a second event"
    );
}

/// After upgrade, the admin allowlist, native-asset toggle, and pause state must
/// all remain functional. This catches regressions where upgrade_storage
/// accidentally resets instance-storage flags.
#[test]
fn test_regression_allowlist_and_pause_intact_after_upgrade() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Seed legacy state.
    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
    });

    // Upgrade.
    client.upgrade_storage(&admin);

    // Configure allowlist and pause.
    let usdc_code = String::from_str(&env, "USDC");
    let usdc_issuer = String::from_str(&env, "GBIssuerPostUpgrade");
    client.allow_asset(&usdc_code, &usdc_issuer);
    client.set_allow_native(&true);

    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "reg-post-upgrade"),
        &payer,
        &usdc_code,
        &usdc_issuer,
        &1_000_000i128,
        &String::from_str(&env, "reg-post-ref"),
    );
    assert!(client.has_payment(&String::from_str(&env, "reg-post-upgrade")));

    // Pause and verify record_payment is blocked but reads still work.
    client.set_paused(&admin, &true);
    let blocked = client.try_record_payment(
        &String::from_str(&env, "reg-blocked"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "reg-blocked-ref"),
    );
    assert_eq!(blocked, Err(Ok(ContractError::ContractPaused)));

    // Read still works.
    assert!(client.has_payment(&String::from_str(&env, "reg-post-upgrade")));
    assert_eq!(client.payment_count(), 1);

    // Unpause and verify writes resume.
    client.set_paused(&admin, &false);
    client.record_payment(
        &String::from_str(&env, "reg-after-unpause"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &100i128,
        &String::from_str(&env, "reg-after-ref"),
    );
    assert_eq!(client.payment_count(), 2);
}

/// Payment history pagination must work correctly after an upgrade from V0
/// with pre-existing legacy payments.
#[test]
fn test_regression_payment_history_after_upgrade() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    // Seed 3 legacy V0 payments.
    let records: soroban_sdk::Vec<PaymentRecord> = soroban_sdk::vec![
        &env,
        PaymentRecord {
            invoice_id: String::from_str(&env, "hist-001"),
            payer: Address::generate(&env),
            asset: Asset::Native,
            amount: 1_000_000i128,
            timestamp: 100u64,
            settlement_ref: String::from_str(&env, "hist-ref-001"),
        },
        PaymentRecord {
            invoice_id: String::from_str(&env, "hist-002"),
            payer: Address::generate(&env),
            asset: Asset::Native,
            amount: 2_000_000i128,
            timestamp: 200u64,
            settlement_ref: String::from_str(&env, "hist-ref-002"),
        },
        PaymentRecord {
            invoice_id: String::from_str(&env, "hist-003"),
            payer: Address::generate(&env),
            asset: Asset::Native,
            amount: 3_000_000i128,
            timestamp: 300u64,
            settlement_ref: String::from_str(&env, "hist-ref-003"),
        },
    ];

    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &3u32);
        for i in 0..3u32 {
            let rec = records.get(i).unwrap();
            env.storage()
                .persistent()
                .set(&DataKey::PaymentHistory(i), &rec);
        }
    });

    // Upgrade schema.
    env.mock_all_auths();
    client.upgrade_storage(&admin);

    // Verify history pagination: page 1 of 2.
    let page1 = client.payment_history(&0u32, &2u32);
    assert_eq!(page1.records.len(), 2);
    assert_eq!(
        page1.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "hist-001")
    );
    assert_eq!(
        page1.records.get(1).unwrap().invoice_id,
        String::from_str(&env, "hist-002")
    );
    assert!(page1.has_more);

    // Page 2.
    let page2 = client.payment_history(&page1.next_cursor, &2u32);
    assert_eq!(page2.records.len(), 1);
    assert_eq!(
        page2.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "hist-003")
    );
    assert!(!page2.has_more);
}

/// A fresh deployment (no legacy state) that goes straight through initialize()
/// must land at the current schema version without requiring upgrade_storage().
#[test]
fn test_regression_fresh_deploy_is_at_current_schema() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let info = client.version_info();
    assert_eq!(
        info,
        ContractMeta {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
        },
        "fresh deployment must already be at current schema version"
    );

    // upgrade_storage on an already-current contract must be idempotent.
    let result = client.try_upgrade_storage(&_admin);
    assert!(result.is_ok());

    let info2 = client.version_info();
    assert_eq!(info2, info);
}

/// Upgrade from V0 must preserve the legacy PaymentRecord fields exactly:
/// invoice_id, payer, asset, amount, timestamp, settlement_ref.
#[test]
fn test_regression_legacy_record_fields_preserved_after_upgrade() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let invoice_id = String::from_str(&env, "field-preserve-001");
    let payer = Address::generate(&env);
    let usdc_code = String::from_str(&env, "USDC");
    let usdc_issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    let legacy_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer: payer.clone(),
        asset: Asset::Token(usdc_code.clone(), usdc_issuer.clone()),
        amount: 42_500_000i128,
        timestamp: 9999u64,
        settlement_ref: String::from_str(&env, "sha256-abcdef"),
    };

    env.as_contract(&client.address, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        env.storage()
            .persistent()
            .set(&DataKey::Payment(invoice_id.clone()), &legacy_record);
    });

    env.mock_all_auths();
    client.upgrade_storage(&admin);

    let loaded = client.get_payment(&invoice_id);
    assert_eq!(loaded.invoice_id, legacy_record.invoice_id);
    assert_eq!(loaded.payer, legacy_record.payer);
    assert_eq!(loaded.asset, legacy_record.asset);
    assert_eq!(loaded.amount, legacy_record.amount);
    assert_eq!(loaded.timestamp, legacy_record.timestamp);
    assert_eq!(loaded.settlement_ref, legacy_record.settlement_ref);
}

// ─── Migration Tests ───────────────────────────────────────────────────────────

#[test]
fn test_upgrade_storage_rebuilds_history_index() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Add some payments
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    for i in 0..5u32 {
        let invoice_id = String::from_str(&env, &format!("migrate-{:02}", i));
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

    // Simulate a legacy deployment by clearing metadata
    env.as_contract(&client.address, || {
        env.storage().instance().remove(&DataKey::ContractMeta);
        // Clear history index to simulate incomplete migration
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

    // Upgrade storage - should rebuild index
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    // History should be restored
    let rebuilt = client.payment_history(&0u32, &10u32);
    assert_eq!(rebuilt.records.len(), 5);
    assert_eq!(rebuilt.next_cursor, 5);
    assert!(!rebuilt.has_more);
}

#[test]
fn test_rebuild_history_index_manual() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Add some payments
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    for i in 0..3u32 {
        let invoice_id = String::from_str(&env, &format!("manual-{:02}", i));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((i as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-{:02}", i)),
        );
    }

    // Clear history index
    env.as_contract(&client.address, || {
        for i in 0..3u32 {
            let key = DataKey::PaymentHistory(i);
            env.storage().persistent().remove(&key);
        }
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &0u32);
    });

    // Verify history is empty
    let empty = client.payment_history(&0u32, &10u32);
    assert_eq!(empty.records.len(), 0);

    // Manually rebuild
    let result = client.try_rebuild_history_index(&admin);
    assert!(result.is_ok());

    // History should be restored
    let rebuilt = client.payment_history(&0u32, &10u32);
    assert_eq!(rebuilt.records.len(), 3);
}

#[test]
fn test_history_index_status() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Check initial status
    let (history_count, payment_count, is_consistent) = client.history_index_status();
    assert_eq!(history_count, 0);
    assert_eq!(payment_count, 0);
    assert!(is_consistent);

    // Add payments
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    for i in 0..3u32 {
        let invoice_id = String::from_str(&env, &format!("status-{:02}", i));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((i as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-{:02}", i)),
        );
    }

    // Status should show consistency
    let (history_count, payment_count, is_consistent) = client.history_index_status();
    assert_eq!(history_count, 3);
    assert_eq!(payment_count, 3);
    assert!(is_consistent);

    // Corrupt the index
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &1u32);
    });

    // Status should show inconsistency
    let (history_count, payment_count, is_consistent) = client.history_index_status();
    assert_eq!(history_count, 1);
    assert_eq!(payment_count, 3);
    assert!(!is_consistent);

    // Rebuild to fix
    let result = client.try_rebuild_history_index(&admin);
    assert!(result.is_ok());

    // Status should show consistency again
    let (history_count, payment_count, is_consistent) = client.history_index_status();
    assert_eq!(history_count, 3);
    assert_eq!(payment_count, 3);
    assert!(is_consistent);
}

#[test]
fn test_rebuild_history_index_unauthorized() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    // Attacker tries to rebuild
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &attacker,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &client.address,
            fn_name: "rebuild_history_index",
            args: (attacker.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_rebuild_history_index(&attacker);
    assert!(result.is_err());

    // Admin can rebuild
    env.mock_all_auths();
    let result = client.try_rebuild_history_index(&_admin);
    assert!(result.is_ok());
}

// ─── Settlement Reference Uniqueness Tests ────────────────────────────────

/// Test that the same settlement_ref cannot be used for two different invoices.
#[test]
fn test_settlement_ref_cannot_be_reused_for_different_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);

    let payer1 = Address::generate(&env);
    let payer2 = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "unique-settle-001");

    // First payment with settlement_ref succeeds
    let invoice_id_1 = String::from_str(&env, "inv-001");
    client.record_payment(
        &invoice_id_1,
        &payer1,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with the SAME settlement_ref but different invoice_id fails
    let invoice_id_2 = String::from_str(&env, "inv-002");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer2,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(), 1);
    assert!(client.has_payment(&invoice_id_1));
    assert!(!client.has_payment(&invoice_id_2));
}

/// Test that the same settlement_ref cannot be used with a different asset.
#[test]
fn test_settlement_ref_cannot_be_reused_with_different_asset() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let usdc_issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    client.allow_asset(&String::from_str(&env, "USDC"), &usdc_issuer);

    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "settle-cross-asset");

    // First payment with XLM succeeds
    let invoice_id_1 = String::from_str(&env, "inv-xlm");
    client.record_payment(
        &invoice_id_1,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with USDC but same settlement_ref fails
    let invoice_id_2 = String::from_str(&env, "inv-usdc");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer,
        &String::from_str(&env, "USDC"),
        &usdc_issuer,
        &50_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(), 1);
    assert!(client.has_payment(&invoice_id_1));
    assert!(!client.has_payment(&invoice_id_2));
}

/// Test that a unique settlement_ref can be used for each invoice.
#[test]
fn test_unique_settlement_refs_for_different_invoices_succeed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);

    let payer = Address::generate(&env);

    // First payment with unique ref
    let invoice_id_1 = String::from_str(&env, "inv-001");
    let ref_1 = String::from_str(&env, "settle-001");
    client.record_payment(
        &invoice_id_1,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &ref_1,
    );

    // Second payment with different ref
    let invoice_id_2 = String::from_str(&env, "inv-002");
    let ref_2 = String::from_str(&env, "settle-002");
    client.record_payment(
        &invoice_id_2,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000i128,
        &ref_2,
    );

    // Both payments should succeed
    assert_eq!(client.payment_count(), 2);
    assert!(client.has_payment(&invoice_id_1));
    assert!(client.has_payment(&invoice_id_2));

    // Verify settlement refs are stored correctly
    let record1 = client.get_payment(&invoice_id_1);
    assert_eq!(record1.settlement_ref, ref_1);

    let record2 = client.get_payment(&invoice_id_2);
    assert_eq!(record2.settlement_ref, ref_2);
}

/// Test that settlement_ref uniqueness is enforced even when invoice_id is different.
#[test]
fn test_settlement_ref_reuse_fails_even_with_different_payer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);

    let payer1 = Address::generate(&env);
    let payer2 = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "shared-settle");

    // First payment succeeds
    let invoice_id_1 = String::from_str(&env, "inv-payer1");
    client.record_payment(
        &invoice_id_1,
        &payer1,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with different payer but same ref fails
    let invoice_id_2 = String::from_str(&env, "inv-payer2");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer2,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(), 1);
    assert!(client.has_payment(&invoice_id_1));
    assert!(!client.has_payment(&invoice_id_2));
}

/// Test that settlement_ref uniqueness check occurs after invoice_id check
/// (both are enforced, but order doesn't matter for correctness).
#[test]
fn test_settlement_ref_check_happens_after_invoice_id_check() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);

    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "settle-unique");

    // First payment succeeds
    let invoice_id = String::from_str(&env, "inv-001");
    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    // Attempt duplicate invoice_id with different settlement_ref
    // Should fail with PaymentAlreadyRecorded (invoice_id check fires first)
    let new_ref = String::from_str(&env, "settle-different");
    let result = client.try_record_payment(
        &invoice_id, // same invoice_id
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000i128,
        &new_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::PaymentAlreadyRecorded)));

    // Attempt same settlement_ref with different invoice_id
    // Should fail with SettlementRefAlreadyUsed
    let new_invoice = String::from_str(&env, "inv-002");
    let result2 = client.try_record_payment(
        &new_invoice,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result2, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only one payment was recorded
    assert_eq!(client.payment_count(), 1);
}

/// Test that empty settlement_ref is rejected (existing test, but verify error code).
#[test]
fn test_empty_settlement_ref_still_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-empty-ref-test"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &String::from_str(&env, ""), // empty settlement_ref
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

/// Test that settlement_ref uniqueness survives after a failed transaction.
#[test]
fn test_settlement_ref_not_consumed_on_failed_transaction() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);

    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "settle-fail-test");

    // Attempt payment with invalid amount (should fail)
    let invoice_id = String::from_str(&env, "inv-fail");
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &0i128, // invalid amount
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));

    // Settlement_ref should NOT be consumed because transaction failed
    // Now try again with valid amount
    let invoice_id_2 = String::from_str(&env, "inv-success");
    client.record_payment(
        &invoice_id_2,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
        &settlement_ref,
    );

    // Verify payment succeeded
    assert_eq!(client.payment_count(), 1);
    assert!(client.has_payment(&invoice_id_2));
}

// ─── Issue #445: bounded payments_by_payer scan + per-payer index ──────────

/// Number of history slots a single `payments_by_payer` invocation may
/// examine on the scan fallback path (mirrors `storage::MAX_PAYER_SCAN_SLOTS`).
const PAGER_SCAN_CAP: u32 = storage::MAX_PAYER_SCAN_SLOTS;

/// Simulate legacy (pre-per-payer-index) storage for `payer` by removing the
/// payer's index keys, forcing `payments_by_payer` onto the bounded-scan path.
fn strip_payer_index(env: &Env, client: &InvoicePaymentContractClient, payer: &Address) {
    let count = env.as_contract(&client.address, || {
        let count = storage::get_payer_payment_count(env, payer).unwrap_or(0u32);
        for ordinal in 0..count {
            env.storage()
                .persistent()
                .remove(&DataKey::PayerPaymentIdx(payer.clone(), ordinal));
        }
        env.storage()
            .persistent()
            .remove(&DataKey::PayerPaymentCount(payer.clone()));
        count
    });
    assert!(count > 0, "payer had no index entries to strip");
}

/// Write a synthetic `PaymentHistory` slot without going through
/// `record_payment`. Lets read-path tests build histories larger than one
/// scan cap cheaply (hundreds of slots), with no per-payer index entries so
/// queries fall back to the bounded scan exactly like pre-V2 data.
fn fabricate_history_slot(
    env: &Env,
    client: &InvoicePaymentContractClient,
    slot: u32,
    payer: &Address,
) {
    env.as_contract(&client.address, || {
        let record = storage::PaymentRecord {
            invoice_id: String::from_str(env, &format!("fabricated-{slot:04}")),
            payer: payer.clone(),
            asset: storage::Asset::Native,
            amount: 1_000_000i128,
            timestamp: slot as u64,
            settlement_ref: String::from_str(env, &format!("settle-fab-{slot:04}")),
        };
        env.storage()
            .persistent()
            .set(&DataKey::PaymentHistory(slot), &record);
    });
}

/// Fabricate `total` contiguous history slots owned by `payer_at(slot)` and
/// set `HistoryCount` accordingly.
fn fabricate_history<F>(env: &Env, client: &InvoicePaymentContractClient, total: u32, payer_at: F)
where
    F: Fn(u32) -> Address,
{
    for slot in 0..total {
        fabricate_history_slot(env, client, slot, &payer_at(slot));
    }
    env.as_contract(&client.address, || {
        storage::set_history_count(env, total);
    });
}

/// Regression test for #445: a large history with sparse payer matches must
/// page through completely via the per-payer index without ever examining
/// unbounded work, and every matching record must be returned exactly once,
/// in insertion order.
#[test]
fn test_payments_by_payer_sparse_matches_page_through_completely() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    let other = Address::generate(&env);

    // 61 payments total; the target payer owns every 6th record → 11
    // matches spread across the whole index.
    let total = 61u32;
    let mut expected: soroban_sdk::Vec<String> = soroban_sdk::Vec::new(&env);
    for idx in 0..total {
        let owner = if idx % 6 == 0 { &payer } else { &other };
        let invoice_id = format!("invoisio-sparse-{idx:02}");
        record_xlm(
            &env,
            &client,
            &invoice_id,
            owner,
            ((idx as i128) + 1) * 1_000_000i128,
        );
        if idx % 6 == 0 {
            expected.push_back(String::from_str(&env, &invoice_id));
        }
    }

    // Page through with a small limit; collect everything.
    let mut seen: soroban_sdk::Vec<String> = soroban_sdk::Vec::new(&env);
    let mut cursor = 0u32;
    let mut calls = 0u32;
    loop {
        let page = client.payments_by_payer(&payer, &cursor, &5u32);
        for rec in page.records.iter() {
            seen.push_back(rec.invoice_id.clone());
        }
        cursor = page.next_cursor;
        calls += 1;
        if !page.has_more {
            break;
        }
        assert!(calls < 50, "pagination did not terminate");
    }

    assert_eq!(seen.len(), expected.len());
    for (got, want) in seen.iter().zip(expected.iter()) {
        assert_eq!(got, want);
    }
    assert_eq!(calls, 3, "11 records at limit 5 should take 3 pages");
}

/// Regression test for #445 (scan fallback): with no per-payer index entries
/// (simulating pre-V2 data), each call examines at most
/// `MAX_PAYER_SCAN_SLOTS` history slots, even when nothing matches, and
/// paging still terminates over the whole sparse result set.
#[test]
fn test_payments_by_payer_bounded_scan_caps_work_per_call() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let other = Address::generate(&env);

    // Grow the history well past several scan caps with only two early
    // matches for the target payer. Fabricated slots carry no index entries,
    // so the read falls back to the bounded scan.
    let total = PAGER_SCAN_CAP * 6 + 40; // 520 slots
    fabricate_history(&env, &client, total, |slot| {
        if slot == 1 || slot == 4 {
            payer.clone()
        } else {
            other.clone()
        }
    });

    // First call: bounded work. The cursor must advance by exactly the cap;
    // both early hits fall inside the first capped window.
    let first = client.payments_by_payer(&payer, &0u32, &25u32);
    assert_eq!(first.records.len(), 2);
    assert_eq!(first.next_cursor, PAGER_SCAN_CAP);
    assert!(first.has_more);

    // A zero-match window still advances by exactly the cap and reports
    // has_more so callers keep going instead of stalling.
    let mut cursor = first.next_cursor;
    let mut pages = 1u32;
    while cursor < total {
        let page = client.payments_by_payer(&payer, &cursor, &25u32);
        let examined = page.next_cursor - cursor;
        assert!(
            examined <= PAGER_SCAN_CAP,
            "call examined {} slots > cap {}",
            examined,
            PAGER_SCAN_CAP
        );
        cursor = page.next_cursor;
        pages += 1;
        assert!(
            !page.records.is_empty() || page.has_more || cursor >= total,
            "stalled: empty page without progress"
        );
        assert!(pages <= 10, "paging did not terminate");
    }
    assert_eq!(
        pages, 7,
        "520 slots / cap 80 should need ceil(520/80)=7 calls"
    );
}

/// Regression test for #445: a payer whose per-payer index exists but who
/// has no recorded payments returns an empty page immediately.
#[test]
fn test_payments_by_payer_zero_match_returns_empty_promptly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let other = Address::generate(&env);
    let stranger = Address::generate(&env); // never recorded a payment

    for idx in 0..30u32 {
        record_xlm(
            &env,
            &client,
            &format!("invoisio-zero-{idx:02}"),
            &other,
            1_000_000i128,
        );
    }

    let page = client.payments_by_payer(&stranger, &0u32, &25u32);
    assert_eq!(page.records.len(), 0);
    assert_eq!(page.gaps_skipped, 0);
    assert!(!page.has_more);
}

/// Regression test for #445 (scan fallback): a never-seen payer against
/// *legacy* data larger than one scan cap gets an empty first page with
/// has_more set — documented behaviour — and paging walks off the end
/// cleanly without ever scanning more than the cap per call.
#[test]
fn test_payments_by_payer_zero_match_legacy_scan_pages_off_end() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let other = Address::generate(&env);
    let stranger = Address::generate(&env);

    let total = PAGER_SCAN_CAP + 30;
    fabricate_history(&env, &client, total, |_| other.clone());

    // The stranger never paid, so they have no index entries; the read falls
    // back to the bounded scan directly (nothing to strip).
    let first = client.payments_by_payer(&stranger, &0u32, &25u32);
    assert_eq!(first.records.len(), 0);
    assert_eq!(first.next_cursor, PAGER_SCAN_CAP);
    assert!(first.has_more, "empty page must signal callers to continue");

    let second = client.payments_by_payer(&stranger, &first.next_cursor, &25u32);
    assert_eq!(second.records.len(), 0);
    assert_eq!(second.next_cursor, total);
    assert!(!second.has_more);
}

/// Regression test for #445: matches spanning multiple pages are returned in
/// order with correct termination, including when the final page is partial.
#[test]
fn test_payments_by_payer_multi_page_span_in_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    let other = Address::generate(&env);

    // Pattern: payer, filler, filler repeated — 7 payer payments spread over
    // 28 history slots. With limit 3 that forces 3 pages (3/3/1).
    let mut expected_idx: u32 = 0;
    for idx in 0..28u32 {
        let is_target = idx % 4 == 0 && expected_idx < 7;
        let owner = if is_target { &payer } else { &other };
        record_xlm(
            &env,
            &client,
            &format!("invoisio-multi-{idx:02}"),
            owner,
            ((idx as i128) + 1) * 1_000_000i128,
        );
        if is_target {
            expected_idx += 1;
        }
    }
    assert_eq!(expected_idx, 7);

    let mut collected: alloc::vec::Vec<i128> = alloc::vec::Vec::new();
    let mut cursor = 0u32;
    loop {
        let page = client.payments_by_payer(&payer, &cursor, &3u32);
        for rec in page.records.iter() {
            collected.push(rec.amount);
        }
        cursor = page.next_cursor;
        if !page.has_more {
            break;
        }
    }
    assert_eq!(collected.len(), 7);
    // Amounts encode original slot order: every 4th payment starting at 0.
    for (n, amount) in collected.iter().enumerate() {
        assert_eq!(*amount, ((n as i128) * 4 + 1) * 1_000_000i128);
    }
}

/// Regression test for #445: bounded-work assertion via the CPU budget —
/// a single zero-match call against a large history must stay far below the
/// ledger budget now that the scan is capped.
#[test]
fn test_payments_by_payer_single_call_cpu_stays_bounded() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let other = Address::generate(&env);

    let total = PAGER_SCAN_CAP + 100;
    fabricate_history(&env, &client, total, |slot| {
        if slot == 0 {
            payer.clone()
        } else {
            other.clone()
        }
    });

    let before = env.cost_estimate().budget().cpu_instruction_cost();
    let page = client.payments_by_payer(&payer, &0u32, &25u32);
    let after = env.cost_estimate().budget().cpu_instruction_cost();

    assert_eq!(page.records.len(), 1);
    // One capped invocation must consume well under the ~100M instruction
    // ledger budget; a full uncapped scan of this size would already be
    // several times larger and grows linearly forever with history length.
    let used = after - before;
    assert!(
        used < 20_000_000u64,
        "single capped call consumed {} CPU instructions",
        used
    );
}

/// Regression test for #445: gap semantics are preserved on the per-payer
/// index path — a removed backing history slot for one of the payer's own
/// ordinals counts in `gaps_skipped` without stalling or mis-ordering the
/// remaining records.
#[test]
fn test_payments_by_payer_index_path_skips_gap_like_payment_history() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    let other = Address::generate(&env);

    record_xlm(&env, &client, "invoisio-gap-a", &payer, 10_000_000);
    record_xlm(&env, &client, "invoisio-gap-b", &other, 20_000_000);
    record_xlm(&env, &client, "invoisio-gap-c", &payer, 30_000_000);

    // Corrupt the shared history slot backing the payer's ordinal 1
    // (slot 2 — their second recorded payment).
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(2));
    });

    let page = client.payments_by_payer(&payer, &0u32, &10u32);
    assert_eq!(page.records.len(), 1);
    assert_eq!(
        page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-gap-a")
    );
    assert_eq!(page.gaps_skipped, 1);
    assert!(!page.has_more);
}

/// Regression test for #445: `rebuild_history_index` reconstructs per-payer
/// indexes for pre-existing payments, moving payers back onto the direct-
/// read path after a rebuild (e.g. following corruption repair).
#[test]
fn test_rebuild_history_index_builds_payer_indexes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    for idx in 0..8u32 {
        record_xlm(
            &env,
            &client,
            &format!("invoisio-rebuild-payer-{idx:02}"),
            &payer,
            ((idx as i128) + 1) * 1_000_000i128,
        );
    }

    // Wipe the payer's index entries entirely (as if the contract was
    // upgraded from a pre-V2 deployment).
    env.as_contract(&client.address, || {
        for ordinal in 0..8u32 {
            env.storage()
                .persistent()
                .remove(&DataKey::PayerPaymentIdx(payer.clone(), ordinal));
        }
        env.storage()
            .persistent()
            .remove(&DataKey::PayerPaymentCount(payer.clone()));
    });

    // Before rebuild: bounded-scan fallback serves the data correctly.
    let scanned = client.payments_by_payer(&payer, &0u32, &25u32);
    assert_eq!(scanned.records.len(), 8);
    assert_eq!(scanned.gaps_skipped, 0);

    client.rebuild_history_index(&admin);

    // After rebuild: direct-read path returns identical results.
    let indexed = client.payments_by_payer(&payer, &0u32, &25u32);
    assert_eq!(indexed.records.len(), 8);
    assert_eq!(indexed.gaps_skipped, 0);
    assert!(!indexed.has_more);
    for n in 0..8u32 {
        let rec = indexed.records.get(n).unwrap();
        assert_eq!(
            rec.invoice_id,
            String::from_str(&env, &format!("invoisio-rebuild-payer-{n:02}"))
        );
    }
}

/// Regression test for #445: the schema V1 → V2 migration backfills
/// per-payer indexes without data loss, and is idempotent.
#[test]
fn test_migration_v1_to_v2_backfills_payer_indexes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer_a = Address::generate(&env);
    let payer_b = Address::generate(&env);
    for idx in 0..12u32 {
        let payer = if idx % 3 == 0 { &payer_a } else { &payer_b };
        record_xlm(
            &env,
            &client,
            &format!("invoisio-mig-{idx:02}"),
            payer,
            1_000_000i128,
        );
    }

    // Roll storage metadata back to V1 and wipe payer indexes to simulate a
    // V1-era deployment.
    env.as_contract(&client.address, || {
        let mut meta =
            storage::get_contract_meta(&env).unwrap_or_else(storage::current_contract_meta);
        meta.storage_schema_version = storage::STORAGE_SCHEMA_V1;
        storage::set_contract_meta(&env, &meta);
        for payer in [payer_a.clone(), payer_b.clone()] {
            let count = storage::get_payer_payment_count(&env, &payer).unwrap_or(0u32);
            for ordinal in 0..count {
                env.storage()
                    .persistent()
                    .remove(&DataKey::PayerPaymentIdx(payer.clone(), ordinal));
            }
            env.storage()
                .persistent()
                .remove(&DataKey::PayerPaymentCount(payer.clone()));
        }
    });
    assert_eq!(
        client.version_info().storage_schema_version,
        storage::STORAGE_SCHEMA_V1
    );

    // Run the upgrade driver; it must route through migrate_schema_v1_to_v2.
    let admin = client.admin();
    client.upgrade_storage(&admin);

    assert_eq!(
        client.version_info().storage_schema_version,
        storage::STORAGE_SCHEMA_VERSION
    );

    // Both payers are back on the direct-read path with complete results.
    for payer in [&payer_a, &payer_b] {
        let mut total = 0u32;
        let mut cursor = 0u32;
        loop {
            let page = client.payments_by_payer(payer, &cursor, &2u32);
            total += page.records.len() as u32;
            cursor = page.next_cursor;
            if !page.has_more {
                break;
            }
        }
        let expected = if payer == &payer_a { 4 } else { 8 };
        assert_eq!(total, expected);

        // Idempotency: running the migration again is safe.
        client.upgrade_storage(&admin);
        let again = client.payments_by_payer(payer, &0u32, &25u32);
        assert_eq!(again.records.len() as u32, expected);
        assert_eq!(again.gaps_skipped, 0);
    }
}
