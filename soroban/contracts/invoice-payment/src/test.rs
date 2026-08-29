#![cfg(test)]
#![allow(clippy::all)]

use super::*;
use crate::storage::{AllowlistMode, ContractConfig};
use alloc::format;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String,
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

/// Compute the SHA-256 commitment `record_payment` stores for a plaintext
/// settlement reference — mirrors `storage::commit_settlement_ref` exactly,
/// so tests assert against the same value the contract actually persists
/// (issue #512), never the plaintext.
fn settlement_commitment(env: &Env, plaintext: &str) -> String {
    crate::storage::commit_settlement_ref(env, &String::from_str(env, plaintext))
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
        &Asset::Native,
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
    env.mock_all_auths();

    assert_eq!(client.admin(), admin);
    assert_eq!(client.payment_count(&admin), 0);
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
        &Asset::Native,
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
        settlement_commitment(&env, "settle-xlm-abc123")
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
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));

    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(String::from_str(&env, "USDC"), issuer.clone()),
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
        settlement_commitment(&env, "settle-usdc-01")
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

    assert_eq!(client.payment_count(&_admin), 3);
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
            &Asset::Native,
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-hist-{idx:02}")),
        );
    }

    let first_page = client.payment_history(&_admin, &0u32, &2u32);
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

    let second_page = client.payment_history(&_admin, &first_page.next_cursor, &2u32);
    assert_eq!(second_page.records.len(), 1);
    assert_eq!(second_page.next_cursor, 3);
    assert!(!second_page.has_more);
    assert_eq!(
        second_page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-history-02")
    );

    let empty_page = client.payment_history(&_admin, &99u32, &2u32);
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
            &Asset::Native,
            &(10_000_000i128 + idx as i128),
            &String::from_str(&env, &format!("settle-cap-{idx:02}")),
        );
    }

    let first_page = client.payment_history(&_admin, &0u32, &100u32);
    assert_eq!(first_page.records.len(), 25);
    assert_eq!(first_page.next_cursor, 25);
    assert!(first_page.has_more);

    let second_page = client.payment_history(&_admin, &first_page.next_cursor, &100u32);
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
            &Asset::Native,
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

    let page = client.payment_history(&_admin, &0u32, &10u32);
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
            &Asset::Native,
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

        let page = client.payment_history(&_admin, &cursor, &2u32);
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
            &Asset::Native,
            &((idx as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-rebuild-{idx:02}")),
        );
    }

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::PaymentHistory(1));
    });

    let corrupted = client.payment_history(&admin, &0u32, &10u32);
    assert_eq!(corrupted.gaps_skipped, 1);
    assert_eq!(corrupted.records.len(), 3);

    client.rebuild_history_index(&admin);

    let rebuilt = client.payment_history(&admin, &0u32, &10u32);
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
        &Asset::Native,
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-dedup-happy"),
    );

    // Check event BEFORE any further contract call; env.events().all() returns
    // events from the last invocation only and is overwritten on the next call.
    // As of issue #512 the event carries only schema_version + invoice_id —
    // no payer/asset/amount/settlement_ref — so a public event stream can no
    // longer be used to bulk-browse the payment ledger.
    let inv_val: soroban_sdk::Val = invoice_id.clone().into_val(&env);
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
                    (Symbol::new(&env, "schema_version"), 2u32.into_val(&env))
                ]
                .into_val(&env),
            ),
        ]
    );

    // Counter must be 1 and record must be present.
    assert_eq!(client.payment_count(&_admin), 1);
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-dedup-dup2"),
    );
    assert_eq!(client.payment_count(&_admin), 1);

    // Second payment with the identical invoice_id — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
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
    assert_eq!(client.payment_count(&_admin), 1);
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
    let usdc_issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));

    // First payment: XLM — succeeds.
    client.set_allow_native(&true);
    client.allow_asset(&String::from_str(&env, "USDC"), &usdc_issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-cross-xlm"),
    );
    assert_eq!(client.payment_count(&_admin), 1);

    // Second attempt: same invoice_id but USDC — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(String::from_str(&env, "USDC"), usdc_issuer.clone()),
        &50_000_000i128,
        &String::from_str(&env, "settle-cross-usdc"),
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::PaymentAlreadyRecorded)),
        "invoice_id is the unique key; different asset must not bypass the guard"
    );

    // Counter must remain 1 — no additional write took place.
    assert_eq!(client.payment_count(&_admin), 1);
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
                Asset::Native,
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
        &Asset::Native,
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
                    Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
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

/// Regression for #508: `get_payment` reads a legacy record correctly via
/// its fallback key, but is a pure read — it must never write a `PaymentV1`
/// copy or touch the legacy entry. Calling it repeatedly must not change
/// that. Migration only happens through the explicit, admin-gated
/// `migrate_legacy_payments`.
#[test]
fn test_get_payment_reads_legacy_key_without_writing() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-legacy-001");
    let payer = Address::generate(&env);
    let legacy_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer,
        asset: Asset::Native,
        amount: 10_000_000i128,
        asset_decimals: 7,
        timestamp: 1234u64,
        settlement_ref: String::from_str(&env, "legacy"),
    };

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Payment(invoice_id.clone()), &legacy_record);
    });

    for _ in 0..3 {
        let loaded = client.get_payment(&invoice_id);
        assert_eq!(loaded, legacy_record);

        let (has_v1, has_legacy) = env.as_contract(&client.address, || {
            (
                env.storage()
                    .persistent()
                    .has(&DataKey::PaymentV1(invoice_id.clone())),
                env.storage()
                    .persistent()
                    .has(&DataKey::Payment(invoice_id.clone())),
            )
        });
        assert!(!has_v1, "get_payment must never write a PaymentV1 copy");
        assert!(has_legacy, "the legacy entry must be untouched");
    }
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

    assert_eq!(client.payment_count(&new_admin), 1);
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
        &Asset::Native,
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
        &Asset::Token(String::from_str(&env, ""), Address::generate(&env)),
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
    // Token with code "XLM" is rejected — native XLM is Asset::Native, not a token.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-no-issuer"),
        &payer,
        &Asset::Token(String::from_str(&env, "XLM"), Address::generate(&env)),
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-event-test"),
    );

    // env.events().all() returns events from the LAST contract invocation only.
    // We must assert BEFORE making any further contract call (e.g. get_payment),
    // otherwise the buffer is overwritten with that call's (empty) events.

    let inv_val: soroban_sdk::Val = invoice_id.into_val(&env);

    // As of issue #512 the event carries only schema_version + invoice_id.
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
                    (Symbol::new(&env, "schema_version"), 2u32.into_val(&env))
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
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
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
    let usdc_issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
    client.allow_asset(&usdc_code, &usdc_issuer);
    let eurt_code = String::from_str(&env, "EURT");
    let eurt_issuer = Address::from_string(&String::from_str(
        &env,
        "GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S",
    ));
    client.allow_asset(&eurt_code, &eurt_issuer);

    // Record XLM payment
    client.record_payment(
        &String::from_str(&env, "invoisio-xlm-001"),
        &payer,
        &Asset::Native,
        &10_000_000i128, // 1 XLM
        &String::from_str(&env, "settle-multi-xlm"),
    );

    // Record USDC payment
    client.record_payment(
        &String::from_str(&env, "invoisio-usdc-001"),
        &payer,
        &Asset::Token(usdc_code.clone(), usdc_issuer.clone()),
        &50_000_000i128, // 5 USDC
        &String::from_str(&env, "settle-multi-usdc"),
    );

    // Record another token payment (e.g., EURT)
    client.record_payment(
        &String::from_str(&env, "invoisio-eurt-001"),
        &payer,
        &Asset::Token(eurt_code.clone(), eurt_issuer.clone()),
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
    assert_eq!(client.payment_count(&_admin), 3);
}

#[test]
fn test_asset_validation_backward_compatibility() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);

    // Empty token code is rejected
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-empty-asset"),
        &payer,
        &Asset::Token(String::from_str(&env, ""), Address::generate(&env)),
        &10_000_000i128,
        &String::from_str(&env, "settle-empty-asset"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Token with reserved code "XLM" is rejected — native is Asset::Native
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-no-issuer-2"),
        &payer,
        &Asset::Token(String::from_str(&env, "XLM"), Address::generate(&env)),
        &100_000_000i128,
        &String::from_str(&env, "settle-no-issuer-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Same: XLM as a Token code is InvalidAsset
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-xlm-with-issuer"),
        &payer,
        &Asset::Token(String::from_str(&env, "XLM"), Address::generate(&env)),
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-serde-xlm"),
    );

    // Retrieve and verify the asset is correctly deserialized
    let record = client.get_payment(&invoice_id);
    assert_eq!(record.asset, Asset::Native);

    // Record a token payment
    let token_invoice_id = String::from_str(&env, "invoisio-token-serde-test");
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));

    client.set_allow_native(&true);
    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);

    client.record_payment(
        &token_invoice_id,
        &payer,
        &Asset::Token(String::from_str(&env, "USDC"), issuer.clone()),
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
    let issuer = Address::generate(&env);

    // 1. Initially rejected
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &100i128,
        &String::from_str(&env, "settle-al-1"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow and succeed
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
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
        &Asset::Token(code.clone(), issuer.clone()),
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
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
    let result = client.try_revoke_asset(&code, &issuer);
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));
}

#[test]
fn test_revoke_asset_empty_issuer_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "XLM");
    let issuer = Address::generate(&env);
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

    // 1. Initially rejected (default is false)
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &100i128,
        &String::from_str(&env, "settle-native-1"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow native and succeed
    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
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
        &Asset::Native,
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
    let issuer = Address::generate(&env);

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
    let issuer = Address::generate(&env);

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
        &Asset::Token(
            String::from_str(&env, "ABCDEFGHIJKLM"),
            Address::from_string(&String::from_str(
                &env,
                "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            )),
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
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
    // A 12-char code is valid; allowlist it so it passes the allowlist guard.
    client.allow_asset(&code, &issuer);
    let invoice_id = String::from_str(&env, "invoisio-12-char-code");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &50_000_000i128,
        &String::from_str(&env, "settle-12-char"),
    );
    assert!(client.has_payment(&invoice_id));
}

#[test]
fn test_amount_at_i128_max_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let invoice_id = String::from_str(&env, "invoisio-amount-i128-max");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &i128::MAX,
        &String::from_str(&env, "settle-big-amount"),
    );
    assert!(client.has_payment(&invoice_id));
}

#[test]
fn test_amount_at_max_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    client.set_allow_native(&true);
    let invoice_id = String::from_str(&env, "invoisio-amount-at-max");
    // The full positive i128 range is supported by the storage type.
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &i128::MAX,
        &String::from_str(&env, "settle-max-amount"),
    );
    assert!(client.has_payment(&invoice_id));
}

#[test]
fn test_non_seven_decimal_asset_precision_round_trip() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let payer = Address::generate(&env);
    let code = String::from_str(&env, "EURT");
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
    client.allow_asset_with_decimals(&code, &issuer, &6);

    let invoice_id = String::from_str(&env, "invoisio-six-decimals");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &1_234_567i128,
        &String::from_str(&env, "settle-six-decimals"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.amount, 1_234_567i128);
    assert_eq!(record.asset_decimals, 6);
}

// Upgrade compatibility tests
#[test]
fn test_multiple_legacy_payments_read_then_explicitly_migrated() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

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
        asset_decimals: 7,
        timestamp: 1000u64,
        settlement_ref: String::from_str(&env, "legacy-001"),
    };
    let record2 = PaymentRecord {
        invoice_id: invoice_ids.get(1).unwrap(),
        payer: payer2.clone(),
        asset: Asset::Native,
        amount: 20_000_000i128,
        asset_decimals: 7,
        timestamp: 2000u64,
        settlement_ref: String::from_str(&env, "legacy-002"),
    };
    let record3 = PaymentRecord {
        invoice_id: invoice_ids.get(2).unwrap(),
        payer: payer3.clone(),
        asset: Asset::Native,
        amount: 30_000_000i128,
        asset_decimals: 7,
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

    // Reads alone must NOT migrate anything (issue #508) — all three stay
    // under their legacy keys until explicitly migrated.
    for id in invoice_ids.iter() {
        let has_v1 = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(id.clone()))
        });
        assert!(!has_v1, "a bare read must not migrate the legacy record");
    }

    // Explicit, admin-gated migration actually moves them.
    let (migrated, already_current, not_found) =
        client.migrate_legacy_payments(&admin, &invoice_ids);
    assert_eq!(migrated, 3);
    assert_eq!(already_current, 0);
    assert_eq!(not_found, 0);

    for id in invoice_ids.iter() {
        let (has_v1, has_legacy) = env.as_contract(&client.address, || {
            (
                env.storage()
                    .persistent()
                    .has(&DataKey::PaymentV1(id.clone())),
                env.storage()
                    .persistent()
                    .has(&DataKey::Payment(id.clone())),
            )
        });
        assert!(has_v1, "record must exist under PaymentV1 after migration");
        assert!(!has_legacy, "legacy key must be removed after migration");
    }

    // Re-running the same batch is a safe no-op (idempotent, resumable).
    let (migrated2, already_current2, not_found2) =
        client.migrate_legacy_payments(&admin, &invoice_ids);
    assert_eq!(migrated2, 0);
    assert_eq!(already_current2, 3);
    assert_eq!(not_found2, 0);
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
        asset_decimals: 7,
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
        &Asset::Native,
        &20_000_000,
        &String::from_str(&env, "settle-new-mix"),
    );

    // Verify both are readable
    let loaded_legacy = client.get_payment(&legacy_invoice_id);
    assert_eq!(loaded_legacy, legacy_record);
    let loaded_new = client.get_payment(&new_invoice_id);
    assert_eq!(loaded_new.invoice_id, new_invoice_id);
    assert_eq!(loaded_new.amount, 20_000_000);

    // Reading the legacy record must NOT migrate it (issue #508) — it stays
    // under its legacy key until explicitly migrated.
    let has_v1 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(legacy_invoice_id.clone()))
    });
    assert!(!has_v1, "a bare read must not migrate the legacy record");
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
        &Asset::Native,
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
        asset_decimals: 7,
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

    // upgrade_storage cannot discover this record — a genuinely legacy
    // Payment(invoice_id) key predates PaymentLog entirely (issue #508), so
    // it stays under the legacy key and is still readable via the fallback.
    let after_upgrade = client.get_payment(&invoice_id);
    assert_eq!(after_upgrade, legacy_record);
    let has_v1_after_upgrade = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .has(&DataKey::PaymentV1(invoice_id.clone()))
    });
    assert!(
        !has_v1_after_upgrade,
        "upgrade_storage cannot discover a pre-PaymentLog legacy record"
    );

    // The explicit, admin-gated migration is what actually moves it.
    let (migrated, already_current, not_found) =
        client.migrate_legacy_payments(&admin, &soroban_sdk::vec![&env, invoice_id.clone()]);
    assert_eq!((migrated, already_current, not_found), (1, 0, 0));

    let final_read = client.get_payment(&invoice_id);
    assert_eq!(final_read, legacy_record);
    let (has_v1, has_legacy) = env.as_contract(&client.address, || {
        (
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(invoice_id.clone())),
            env.storage()
                .persistent()
                .has(&DataKey::Payment(invoice_id.clone())),
        )
    });
    assert!(has_v1, "record must exist under PaymentV1 after migration");
    assert!(!has_legacy, "legacy key must be removed after migration");
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

// ─── upgrade() ──────────────────────────────────────────────────────────────
//
// The full "actually swaps the running code" path needs a real, callable
// WASM binary — `env.deployer().upload_contract_wasm(...)` traps on
// synthetic bytes, so that end-to-end coverage lives in the
// `upgrade_wasm_integration` module below, gated behind the
// `upgrade-fixture-test` feature (see its doc comment). The tests here cover
// every rejection path, which never reach the deployer host call at all and
// so need no real WASM.

/// A syntactically valid but never-installed WASM hash — sufficient for
/// negative tests that must fail before `upgrade()` reaches the deployer.
fn dummy_wasm_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

#[test]
fn test_upgrade_before_initialize_returns_not_initialized() {
    let env = Env::default();
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let result = client.try_upgrade(&admin, &dummy_wasm_hash(&env), &2_000_000u32);
    assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
}

#[test]
fn test_upgrade_requires_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    env.mock_all_auths();

    client.set_paused(&admin, &true);

    let attacker = Address::generate(&env);
    let result = client.try_upgrade(&attacker, &dummy_wasm_hash(&env), &2_000_000u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::Unauthorized)),
        "non-admin upgrade() must return Unauthorized"
    );
}

#[test]
fn test_upgrade_requires_contract_paused() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    env.mock_all_auths();

    // Not paused yet — must be rejected before ever touching the deployer.
    let result = client.try_upgrade(&admin, &dummy_wasm_hash(&env), &2_000_000u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::MustBePausedForUpgrade)),
        "upgrade() while unpaused must return MustBePausedForUpgrade"
    );

    // Pausing clears the way (the call then proceeds to the deployer, which
    // traps on this placeholder hash — the pause gate itself is what this
    // test verifies, not the deployer call).
    assert!(!client.is_paused());
    client.set_paused(&admin, &true);
    assert!(client.is_paused());
}

/// End-to-end coverage for the documented `upgrade()` → `upgrade_storage()`
/// runbook, using this crate's own compiled WASM as the "new" code.
///
/// `env.deployer().upload_contract_wasm(...)` requires real, callable WASM
/// bytes (a synthetic byte array traps as soon as it's invoked), and
/// `contractimport!` resolves its `file` path at compile time — so this
/// module is opt-in via the `upgrade-fixture-test` Cargo feature rather than
/// part of the default `cargo test` run, which the Soroban CI job runs
/// *before* the WASM build step (and against a different build target).
///
/// Run it explicitly, after building the contract:
///   ./build.sh && cargo test -p invoice-payment --features upgrade-fixture-test
#[cfg(feature = "upgrade-fixture-test")]
mod upgrade_wasm_integration {
    use super::*;

    mod rebuilt_self {
        soroban_sdk::contractimport!(
            file = "../../target/wasm32v1-none/release/invoice_payment.wasm"
        );
    }

    /// Upgrades a live contract to a freshly-built copy of its own code, then
    /// runs `upgrade_storage()` under that new code — exercising the full
    /// documented runbook, not just the storage-migration step in isolation.
    #[test]
    fn test_wasm_upgrade_then_storage_migration_preserves_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        // Seed state that must survive the upgrade unchanged.
        let payer = Address::generate(&env);
        client.set_allow_native(&true);
        client.allow_asset(
            &String::from_str(&env, "USDC"),
            &Address::from_string(&String::from_str(
                &env,
                "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
            )),
        );
        for i in 0..3u32 {
            let invoice_id = String::from_str(&env, &format!("wasm-upgrade-{i:02}"));
            client.record_payment(
                &invoice_id,
                &payer,
                &Asset::Native,
                &((i as i128 + 1) * 10_000_000i128),
                &String::from_str(&env, &format!("settle-wasm-upgrade-{i:02}")),
            );
        }

        let admin_before = client.admin();
        let history_before = client.payment_history(&admin, &0u32, &10u32);
        let count_before = client.payment_count(&admin);
        let native_allowed_before = client.config().allowlist_mode.native_allowed;

        // Step 1: pause (required by upgrade()).
        client.set_paused(&admin, &true);

        // Step 2: install and switch to the new code.
        let new_hash = env.deployer().upload_contract_wasm(rebuilt_self::WASM);
        client.upgrade(&admin, &new_hash, &CONTRACT_VERSION);

        // Step 3: run the storage migration under the new code.
        client.upgrade_storage(&admin);

        // Step 4: verify state survived, and that the new code is live.
        assert_eq!(client.admin(), admin_before);
        assert_eq!(client.payment_count(&admin), count_before);
        let history_after = client.payment_history(&admin, &0u32, &10u32);
        assert_eq!(history_after.records.len(), history_before.records.len());
        for (before, after) in history_before
            .records
            .iter()
            .zip(history_after.records.iter())
        {
            assert_eq!(before.invoice_id, after.invoice_id);
            assert_eq!(before.amount, after.amount);
        }
        assert_eq!(
            client.config().allowlist_mode.native_allowed,
            native_allowed_before
        );
        assert_eq!(client.contract_version(), CONTRACT_VERSION);
        assert_eq!(
            client.version_info().storage_schema_version,
            STORAGE_SCHEMA_VERSION
        );

        // Step 5: unpause.
        client.set_paused(&admin, &false);
        assert!(!client.is_paused());

        // The contract is fully functional post-upgrade, under the new code.
        client.record_payment(
            &String::from_str(&env, "wasm-upgrade-post"),
            &payer,
            &Asset::Native,
            &50_000_000i128,
            &String::from_str(&env, "settle-wasm-upgrade-post"),
        );
        assert_eq!(client.payment_count(&admin), count_before + 1);
    }
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
        &Asset::Native,
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-unpaused"),
    );
    assert_eq!(client.payment_count(&admin), 1);
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
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-read-test"),
    );

    // Pause the contract
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // All read operations should still work
    assert!(client.has_payment(&String::from_str(&env, "invoisio-read-test")));
    assert_eq!(client.payment_count(&admin), 1);
    assert!(
        client
            .get_payment(&String::from_str(&env, "invoisio-read-test"))
            .invoice_id
            .len()
            > 0
    );
    assert_eq!(
        client.payment_history(&admin, &0u32, &10u32).records.len(),
        1
    );
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    let record = client.get_payment(&invoice_id);
    // The stored value is the SHA-256 commitment of what was supplied, not
    // the plaintext (issue #512) — the plaintext is never recoverable from
    // on-chain data.
    assert_eq!(
        record.settlement_ref,
        settlement_commitment(&env, "sha256-abcdef1234567890")
    );
    assert_ne!(record.settlement_ref, settlement_ref);
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
        &Asset::Native,
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
    // 129 chars (lowercase, i.e. otherwise canonical) exceeds the 128-char limit
    let long_ref = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-long-ref"),
        &payer,
        &Asset::Native,
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
    // Exactly 128 chars, lowercase (canonical form) — should be accepted
    let ref_128 = String::from_str(
        &env,
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    let invoice_id = String::from_str(&env, "invoisio-ref-128");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &ref_128,
    );
    let record = client.get_payment(&invoice_id);
    assert_eq!(
        record.settlement_ref,
        crate::storage::commit_settlement_ref(&env, &ref_128)
    );
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    let inv_val: soroban_sdk::Val = invoice_id.into_val(&env);
    let _ = payer; // no longer part of the minimized event (issue #512)
    let _ = settlement_ref; // ditto — dropped from the event entirely

    // As of issue #512 the event carries only schema_version + invoice_id —
    // not even the settlement_ref commitment.
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
                    (Symbol::new(&env, "schema_version"), 2u32.into_val(&env))
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
    let issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));

    client.allow_asset(&String::from_str(&env, "USDC"), &issuer);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Token(String::from_str(&env, "USDC"), issuer.clone()),
        &50_000_000i128,
        &String::from_str(&env, "settle-usdc-hash-789"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(
        record.settlement_ref,
        settlement_commitment(&env, "settle-usdc-hash-789")
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
    let issuer = Address::generate(&env);

    // First allow — no error expected.
    client.allow_asset(&code, &issuer);

    // Second allow of the exact same asset — must not error.
    client.allow_asset(&code, &issuer);

    // Asset is still in the allowlist: a payment should succeed.
    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "inv-double-allow"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
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
    let issuer = Address::generate(&env);
    let payer = Address::generate(&env);

    // 1. Allow → payment succeeds.
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-readd-1"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &200i128,
        &String::from_str(&env, "settle-readd-1"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-readd-1")));

    // 2. Revoke → next payment must fail.
    client.revoke_asset(&code, &issuer);
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-readd-2"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &200i128,
        &String::from_str(&env, "settle-readd-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 3. Re-allow → payment must succeed again.
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-readd-3"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
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
    let issuer = Address::generate(&env);

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
        &Asset::Token(code.clone(), issuer.clone()),
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
    let issuer = Address::generate(&env);

    // Add, then revoke once — standard path.
    client.allow_asset(&code, &issuer);
    client.revoke_asset(&code, &issuer);

    // Second revoke of the same (now absent) asset must not error.
    let result = client.try_revoke_asset(&code, &issuer);
    assert!(result.is_ok(), "double-revoke must be idempotent");
}

/// A caller with no prior knowledge of which assets are allowlisted must be
/// able to discover all of them via `allowed_assets` alone (issue #464).
#[test]
fn test_allowed_assets_enumerates_without_prior_knowledge() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let pairs: alloc::vec::Vec<(String, Address)> = alloc::vec![
        (String::from_str(&env, "USDC"), Address::generate(&env)),
        (String::from_str(&env, "EURT"), Address::generate(&env)),
        (String::from_str(&env, "GBPT"), Address::generate(&env)),
    ];
    for (code, issuer) in pairs.iter() {
        client.allow_asset(code, issuer);
    }

    let page = client.allowed_assets(&0u32, &25u32);
    assert_eq!(page.records.len(), 3);
    assert!(!page.has_more);
    assert_eq!(page.gaps_skipped, 0);

    let found: alloc::vec::Vec<(String, Address)> = page
        .records
        .iter()
        .map(|entry| (entry.code.clone(), entry.issuer.clone()))
        .collect();
    for (code, issuer) in pairs.iter() {
        assert!(found.contains(&(code.clone(), issuer.clone())));
    }
}

/// Pagination must be bounded by the page cap and must terminate — mirrors
/// `test_settlement_ref_history_pages_in_write_order` / the #418 pagination
/// fix's regression test.
#[test]
fn test_allowed_assets_pagination_terminates_with_bounded_pages() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    for idx in 0..30u32 {
        client.allow_asset(
            &String::from_str(&env, &format!("A{idx:02}")),
            &Address::generate(&env),
        );
    }

    let mut collected: alloc::vec::Vec<storage::AllowlistEntry> = alloc::vec::Vec::new();
    let mut cursor = 0u32;
    let mut iterations = 0u32;
    loop {
        iterations += 1;
        assert!(iterations <= 10, "pagination did not terminate");

        let page = client.allowed_assets(&cursor, &10u32);
        assert!(page.records.len() as u32 <= 10, "page exceeded the cap");
        assert!(page.next_cursor > cursor || !page.has_more);

        collected.extend(page.records.iter());
        cursor = page.next_cursor;
        if !page.has_more {
            break;
        }
    }

    assert_eq!(collected.len(), 30);
    assert_eq!(collected.len() as u32, client.allowlist_count());
}

/// `allowlist_count()` must track the live membership exactly through an
/// arbitrary sequence of adds and revokes — not the write-order log length,
/// which only ever grows (issue #464).
#[test]
fn test_allowlist_count_matches_enumerable_entries_after_adds_and_revokes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let issuer = Address::generate(&env);
    let a = String::from_str(&env, "AAAA");
    let b = String::from_str(&env, "BBBB");
    let c = String::from_str(&env, "CCCC");

    client.allow_asset(&a, &issuer);
    client.allow_asset(&b, &issuer);
    client.allow_asset(&c, &issuer);
    assert_eq!(client.allowlist_count(), 3);

    client.revoke_asset(&b, &issuer);
    assert_eq!(client.allowlist_count(), 2);

    // Re-adding after revoke restores membership and the count.
    client.allow_asset(&b, &issuer);
    assert_eq!(client.allowlist_count(), 3);

    client.revoke_asset(&a, &issuer);
    client.revoke_asset(&c, &issuer);
    assert_eq!(client.allowlist_count(), 1);

    // The count must match a full enumeration scan exactly.
    let page = client.allowed_assets(&0u32, &25u32);
    let live: alloc::vec::Vec<_> = page
        .records
        .iter()
        .map(|entry| (entry.code.clone(), entry.issuer.clone()))
        .collect();
    assert_eq!(live.len() as u32, client.allowlist_count());
    assert_eq!(live, alloc::vec![(b.clone(), issuer.clone())]);
}

/// Revoking an asset must remove it from the enumeration, not just from
/// `is_asset_allowed` (issue #464).
#[test]
fn test_revoke_asset_removes_it_from_enumeration() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let issuer = Address::generate(&env);
    let kept = String::from_str(&env, "KEEP");
    let revoked = String::from_str(&env, "GONE");

    client.allow_asset(&kept, &issuer);
    client.allow_asset(&revoked, &issuer);
    client.revoke_asset(&revoked, &issuer);

    let page = client.allowed_assets(&0u32, &25u32);
    let codes: alloc::vec::Vec<String> = page.records.iter().map(|entry| entry.code).collect();
    assert!(codes.contains(&kept));
    assert!(!codes.contains(&revoked));
}

/// `allow_asset` must reject any `code` that `record_payment` would reject
/// as invalid — specifically, the 12-character Stellar asset-code length
/// cap — so a pair that can never be paid cannot be added (issue #464).
#[test]
fn test_allow_asset_rejects_code_longer_than_twelve_chars() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let result = client.try_allow_asset(
        &String::from_str(&env, "ABCDEFGHIJKLM"), // 13 chars
        &Address::from_string(&String::from_str(
            &env,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        )),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // A 12-char code — the boundary record_payment itself accepts — must
    // still be allowed.
    client.allow_asset(
        &String::from_str(&env, "ABCDEFGHIJKL"), // 12 chars
        &Address::from_string(&String::from_str(
            &env,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        )),
    );
    assert_eq!(client.allowlist_count(), 1);
}

/// A no-op revoke (never allowlisted) must be distinguishable from a real
/// one purely by event emission — `AssetRevoked` fires only when an entry
/// actually existed (issue #464). `test_allowlist_events_emitted` already
/// confirms a real revoke emits it; this covers the no-op side.
#[test]
fn test_revoke_asset_emits_no_event_when_never_allowlisted() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let phantom_code = String::from_str(&env, "GHOST");
    let issuer = Address::generate(&env);

    // env.events().all() only reflects the last invocation, so this must be
    // asserted immediately after the one call under test.
    client.revoke_asset(&phantom_code, &issuer);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![&env],
        "a no-op revoke on a never-allowlisted pair must not emit AssetRevoked"
    );
}

/// Re-running `migrate_schema_v3_to_v4` (or running it after the admin has
/// already re-allowed some pairs post-upgrade) must not create duplicate
/// log entries or double-count `allowlist_count()` (issue #464).
#[test]
fn test_migrate_schema_v3_to_v4_backfills_allowlist_from_payment_history() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    let code = String::from_str(&env, "USDC");
    let issuer = Address::generate(&env);

    // Simulate a pre-schema-V4 deployment: the asset was allowlisted and
    // paid with using only the legacy code path (no enumeration index).
    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-legacy-allowlist"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &100i128,
        &String::from_str(&env, "settle-legacy-allowlist"),
    );

    // Wipe the enumeration index the live allow_asset call above already
    // built, and roll the schema back to V3, to reproduce a genuine legacy
    // deployment that predates the index entirely.
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::AllowListLog(0u32));
        env.storage()
            .persistent()
            .remove(&DataKey::AllowListIndexV6(code.clone(), issuer.clone()));
        env.storage()
            .instance()
            .set(&DataKey::AllowListCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::AllowListLogCount, &0u32);

        let mut meta =
            storage::get_contract_meta(&env).unwrap_or_else(storage::current_contract_meta);
        meta.storage_schema_version = storage::STORAGE_SCHEMA_V3;
        storage::set_contract_meta(&env, &meta);
    });
    assert_eq!(client.allowlist_count(), 0);
    assert_eq!(
        client.version_info().storage_schema_version,
        storage::STORAGE_SCHEMA_V3
    );

    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    assert_eq!(client.allowlist_count(), 1);
    let page = client.allowed_assets(&0u32, &25u32);
    assert_eq!(page.records.len(), 1);
    assert_eq!(page.records.get(0).unwrap().code, code);
    assert_eq!(page.records.get(0).unwrap().issuer, issuer);
}

/// Re-running the V3 → V4 migration step directly (simulating it running
/// after the admin already re-allowed a pair post-upgrade) must not
/// duplicate the log entry or double-count `allowlist_count()` (issue #464).
#[test]
fn test_migrate_schema_v3_to_v4_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let code = String::from_str(&env, "USDC");
    let issuer = Address::generate(&env);

    client.allow_asset(&code, &issuer);
    client.record_payment(
        &String::from_str(&env, "inv-legacy-allowlist-2"),
        &payer,
        &Asset::Token(code.clone(), issuer.clone()),
        &100i128,
        &String::from_str(&env, "settle-legacy-allowlist-2"),
    );
    assert_eq!(client.allowlist_count(), 1);

    // Run the migration step directly, twice, against a deployment that is
    // already fully indexed (as if the admin had re-allowed the pair after
    // an earlier partial migration run).
    env.as_contract(&client.address, || {
        crate::migration::migrate_schema_v3_to_v4(&env).unwrap();
        crate::migration::migrate_schema_v3_to_v4(&env).unwrap();
    });

    assert_eq!(client.allowlist_count(), 1);
    let page = client.allowed_assets(&0u32, &25u32);
    assert_eq!(page.records.len(), 1);
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
    let issuer = Address::generate(&env);

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
    let issuer = Address::generate(&env);

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
    let issuer = Address::generate(&env);

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
    let issuer = Address::generate(&env);

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
        &Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
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
/// The call must succeed, `is_paused()` must still return `true`, and
/// **no spurious event** may be emitted — the event stream must be a
/// faithful record of actual state transitions.
#[test]
fn test_set_paused_double_pause_is_idempotent() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // Second pause — must not error and must emit NO event.
    let result = client.try_set_paused(&admin, &true);
    assert!(result.is_ok(), "double-pause must be idempotent");
    assert!(client.is_paused(), "contract must remain paused");
    assert_eq!(
        env.events().all().events().len(),
        0,
        "double-pause (no-op) must not emit a spurious transition event"
    );
}

/// Unpausing an already-unpaused contract must be idempotent.
/// No spurious event may be emitted on a no-op.
#[test]
fn test_set_paused_double_unpause_is_idempotent() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Default is unpaused; explicitly unpause again.
    let result = client.try_set_paused(&admin, &false);
    assert!(result.is_ok(), "double-unpause must be idempotent");
    assert!(!client.is_paused(), "contract must remain unpaused");
    assert_eq!(
        env.events().all().events().len(),
        0,
        "double-unpause (no-op) must not emit a spurious transition event"
    );
}

/// While the contract is paused, `allow_asset` must be rejected with
/// [`ContractError::ContractPaused` — the asset allowlist is part of the
/// control plane and must remain stable during incident containment.
#[test]
fn test_allow_asset_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let code = String::from_str(&env, "USDC");
    let issuer = Address::generate(&env);

    // allow_asset must fail while paused.
    let result = client.try_allow_asset(&code, &issuer);
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "allow_asset must return ContractPaused while contract is paused"
    );
}

/// While paused, `revoke_asset` must be rejected with
/// [`ContractError::ContractPaused`].
#[test]
fn test_revoke_asset_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let issuer = Address::generate(&env);
    client.allow_asset(&code, &issuer);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // revoke_asset must fail while paused.
    let result = client.try_revoke_asset(&code, &issuer);
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "revoke_asset must return ContractPaused while contract is paused"
    );
}

/// While paused, `set_allow_native` must be rejected with
/// [`ContractError::ContractPaused`] and the native_allowed config must
/// **not** change — the guard fires before any storage write.
#[test]
fn test_set_allow_native_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let result = client.try_set_allow_native(&true);
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "set_allow_native must return ContractPaused while contract is paused"
    );
    assert!(
        !client.config().allowlist_mode.native_allowed,
        "native_allowed must remain false after a blocked paused-state call"
    );
}

/// While paused, both steps of the admin handoff must be rejected with
/// [`ContractError::ContractPaused`].  Two scenarios matter for security:
///
/// **Scenario A — proposal during pause:** a compromised admin cannot even
/// stage a new proposal while the contract is in containment.
///
/// **Scenario B — acceptance of a proposal staged *before* pause:** even if
/// an attacker managed to sneak in a proposal just before the operator hit
/// pause, the role cannot actually be claimed until the operator has
/// investigated (and, if necessary, cancelled the proposal via
/// [`cancel_admin_transfer`]) after unpausing.
#[test]
fn test_admin_transfer_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // ── Scenario A: propose while paused → blocked ─────────────────────
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let attacker = Address::generate(&env);
    let propose_paused = client.try_propose_admin(&attacker);
    assert_eq!(
        propose_paused,
        Err(Ok(ContractError::ContractPaused)),
        "propose_admin must return ContractPaused while contract is paused (scenario A)"
    );
    assert_eq!(
        client.pending_admin(),
        None,
        "pending_admin must remain None after a blocked paused proposal"
    );
    assert_eq!(
        client.admin(),
        admin,
        "admin must remain unchanged after a blocked paused proposal"
    );
    // Unpause so scenario B can reuse the same env.
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());

    // ── Scenario B: proposal staged BEFORE pause, accept WHILE paused ─
    let new_admin = Address::generate(&env);
    client.propose_admin(&new_admin);
    assert_eq!(
        client.pending_admin(),
        Some(new_admin.clone()),
        "precondition: proposal must be staged while unpaused"
    );

    // Now pause — the critical containment window starts.
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let accept_paused = client.try_accept_admin(&new_admin);
    assert_eq!(
        accept_paused,
        Err(Ok(ContractError::ContractPaused)),
        "accept_admin must return ContractPaused while contract is paused (scenario B)"
    );
    assert_eq!(
        client.admin(),
        admin,
        "admin must NOT change even though a valid proposal was staged before pause"
    );
    assert_eq!(
        client.pending_admin(),
        Some(new_admin.clone()),
        "pending_admin must remain intact during pause (operator inspects after unpause)"
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
        &Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
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
    let issuer = Address::generate(&env);

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
        &Asset::Token(code.clone(), issuer.clone()),
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
    let issuer = Address::generate(&env);

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
        &Asset::Token(code.clone(), issuer.clone()),
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
            asset_decimals: 7,
            timestamp: 100u64,
            settlement_ref: String::from_str(&env, "reg-ref-001"),
        },
        PaymentRecord {
            invoice_id: invoices.get(1).unwrap(),
            payer: payers.get(1).unwrap(),
            asset: Asset::Token(String::from_str(&env, "USDC"), Address::generate(&env),),
            amount: 100_000_000i128,
            asset_decimals: 7,
            timestamp: 200u64,
            settlement_ref: String::from_str(&env, "reg-ref-002"),
        },
        PaymentRecord {
            invoice_id: invoices.get(2).unwrap(),
            payer: payers.get(2).unwrap(),
            asset: Asset::Native,
            amount: 15_000_000i128,
            asset_decimals: 7,
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

    // 5. All payments remain readable after upgrade_storage — but a
    //    genuinely legacy Payment(invoice_id) key predates PaymentLog
    //    entirely, so upgrade_storage cannot discover or migrate it
    //    (issue #508). It stays under the legacy key until the admin
    //    explicitly migrates it via migrate_legacy_payments.
    let mut legacy_ids: soroban_sdk::Vec<String> = soroban_sdk::vec![&env];
    for i in 0..3u32 {
        let inv = records.get(i).unwrap().invoice_id.clone();
        let loaded = client.get_payment(&inv);
        assert_eq!(loaded, records.get(i).unwrap());

        let has_v1 = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(inv.clone()))
        });
        assert!(
            !has_v1,
            "upgrade_storage cannot discover a pre-PaymentLog legacy record"
        );
        legacy_ids.push_back(inv);
    }

    // Explicit migration moves all three to PaymentV1 and removes the
    // legacy keys.
    let (migrated, already_current, not_found) =
        client.migrate_legacy_payments(&admin, &legacy_ids);
    assert_eq!((migrated, already_current, not_found), (3, 0, 0));
    for i in 0..3u32 {
        let inv = records.get(i).unwrap().invoice_id.clone();
        let loaded = client.get_payment(&inv);
        assert_eq!(loaded, records.get(i).unwrap());

        let (has_v1, has_legacy) = env.as_contract(&client.address, || {
            (
                env.storage()
                    .persistent()
                    .has(&DataKey::PaymentV1(inv.clone())),
                env.storage()
                    .persistent()
                    .has(&DataKey::Payment(inv.clone())),
            )
        });
        assert!(has_v1, "payment must be migrated to V1 key");
        assert!(!has_legacy, "legacy key must be removed after migration");
    }

    // 6. Record a new payment after upgrade — must succeed and use V1 key.
    let new_payer = Address::generate(&env);
    client.set_allow_native(&true);
    client.record_payment(
        &String::from_str(&env, "reg-new-001"),
        &new_payer,
        &Asset::Native,
        &7_000_000i128,
        &String::from_str(&env, "reg-new-ref"),
    );
    assert_eq!(client.payment_count(&admin), 1);
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
    let usdc_issuer = Address::generate(&env);
    client.allow_asset(&usdc_code, &usdc_issuer);
    client.set_allow_native(&true);

    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "reg-post-upgrade"),
        &payer,
        &Asset::Token(usdc_code.clone(), usdc_issuer.clone()),
        &1_000_000i128,
        &String::from_str(&env, "reg-post-ref"),
    );
    assert!(client.has_payment(&String::from_str(&env, "reg-post-upgrade")));

    // Pause and verify record_payment is blocked but reads still work.
    client.set_paused(&admin, &true);
    let blocked = client.try_record_payment(
        &String::from_str(&env, "reg-blocked"),
        &payer,
        &Asset::Native,
        &100i128,
        &String::from_str(&env, "reg-blocked-ref"),
    );
    assert_eq!(blocked, Err(Ok(ContractError::ContractPaused)));

    // Read still works.
    assert!(client.has_payment(&String::from_str(&env, "reg-post-upgrade")));
    assert_eq!(client.payment_count(&admin), 1);

    // Unpause and verify writes resume.
    client.set_paused(&admin, &false);
    client.record_payment(
        &String::from_str(&env, "reg-after-unpause"),
        &payer,
        &Asset::Native,
        &100i128,
        &String::from_str(&env, "reg-after-ref"),
    );
    assert_eq!(client.payment_count(&admin), 2);
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
            asset_decimals: 7,
            timestamp: 100u64,
            settlement_ref: String::from_str(&env, "hist-ref-001"),
        },
        PaymentRecord {
            invoice_id: String::from_str(&env, "hist-002"),
            payer: Address::generate(&env),
            asset: Asset::Native,
            amount: 2_000_000i128,
            asset_decimals: 7,
            timestamp: 200u64,
            settlement_ref: String::from_str(&env, "hist-ref-002"),
        },
        PaymentRecord {
            invoice_id: String::from_str(&env, "hist-003"),
            payer: Address::generate(&env),
            asset: Asset::Native,
            amount: 3_000_000i128,
            asset_decimals: 7,
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
    let page1 = client.payment_history(&admin, &0u32, &2u32);
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
    let page2 = client.payment_history(&admin, &page1.next_cursor, &2u32);
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
    let usdc_issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));

    let legacy_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer: payer.clone(),
        asset: Asset::Token(usdc_code.clone(), usdc_issuer.clone()),
        amount: 42_500_000i128,
        asset_decimals: 7,
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
            &Asset::Native,
            &((i as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-{:02}", i)),
        );
    }

    // Verify initial history
    let history = client.payment_history(&admin, &0u32, &10u32);
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
    let empty = client.payment_history(&admin, &0u32, &10u32);
    assert_eq!(empty.records.len(), 0);

    // Upgrade storage - should rebuild index
    let result = client.try_upgrade_storage(&admin);
    assert!(result.is_ok());

    // History should be restored
    let rebuilt = client.payment_history(&admin, &0u32, &10u32);
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
            &Asset::Native,
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
    let empty = client.payment_history(&admin, &0u32, &10u32);
    assert_eq!(empty.records.len(), 0);

    // Manually rebuild
    let result = client.try_rebuild_history_index(&admin);
    assert!(result.is_ok());

    // History should be restored
    let rebuilt = client.payment_history(&admin, &0u32, &10u32);
    assert_eq!(rebuilt.records.len(), 3);
}

#[test]
fn test_history_index_status() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Check initial status
    let (history_count, payment_count, is_consistent) = client.history_index_status(&admin);
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
            &Asset::Native,
            &((i as i128 + 1) * 10_000_000i128),
            &String::from_str(&env, &format!("settle-{:02}", i)),
        );
    }

    // Status should show consistency
    let (history_count, payment_count, is_consistent) = client.history_index_status(&admin);
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
    let (history_count, payment_count, is_consistent) = client.history_index_status(&admin);
    assert_eq!(history_count, 1);
    assert_eq!(payment_count, 3);
    assert!(!is_consistent);

    // Rebuild to fix
    let result = client.try_rebuild_history_index(&admin);
    assert!(result.is_ok());

    // Status should show consistency again
    let (history_count, payment_count, is_consistent) = client.history_index_status(&admin);
    assert_eq!(history_count, 3);
    assert_eq!(payment_count, 3);
    assert!(is_consistent);
}

// ─── Issue #512: bulk/volume reads are admin-gated ─────────────────────────
//
// `payment_history`, `payment_count`, `history_index_status`,
// `settlement_ref_history`, and `settlement_ref_index_status` all enumerate
// or summarize activity across the whole contract, so — unlike `get_payment`
// or `settlement_ref_owner`, which only ever answer about an identifier the
// caller already supplied — they must reject a non-admin caller and work
// normally for the admin, mirroring `rebuild_history_index`'s auth pattern.

#[test]
fn test_payment_history_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_payment_history(&attacker, &0u32, &10u32);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_payment_history_works_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-gated-history", &payer, 10_000_000);

    let page = client.payment_history(&admin, &0u32, &10u32);
    assert_eq!(page.records.len(), 1);
}

#[test]
fn test_payment_count_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_payment_count(&attacker);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_payment_count_works_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-gated-count", &payer, 10_000_000);

    assert_eq!(client.payment_count(&admin), 1);
}

#[test]
fn test_history_index_status_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_history_index_status(&attacker);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_history_index_status_works_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let (history_count, payment_count, is_consistent) = client.history_index_status(&admin);
    assert_eq!((history_count, payment_count, is_consistent), (0, 0, true));
}

#[test]
fn test_settlement_ref_history_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_settlement_ref_history(&attacker, &0u32, &10u32);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_settlement_ref_history_works_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-gated-refhist", &payer, 10_000_000);

    let page = client.settlement_ref_history(&admin, &0u32, &10u32);
    assert_eq!(page.records.len(), 1);
}

#[test]
fn test_settlement_ref_index_status_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let result = client.try_settlement_ref_index_status(&attacker);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn test_settlement_ref_index_status_works_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    assert_eq!(client.settlement_ref_index_status(&admin), (0, 0, true));
}

// ─── Issue #512: settlement_ref is a SHA-256 commitment, not plaintext ─────

#[test]
fn test_settlement_ref_commitment_differs_for_different_plaintexts_same_length() {
    let env = Env::default();
    // Same length (12 chars), different content — commitments must differ.
    let a = settlement_commitment(&env, "settle-aaaa1");
    let b = settlement_commitment(&env, "settle-bbbb1");
    assert_eq!(a.len(), b.len());
    assert_ne!(a, b);
}

#[test]
fn test_settlement_ref_commitment_is_deterministic() {
    let env = Env::default();
    // The same plaintext always hashes to the same commitment, so dedup via
    // the settlement-reference uniqueness guard still works.
    let a = settlement_commitment(&env, "settle-deterministic");
    let b = settlement_commitment(&env, "settle-deterministic");
    assert_eq!(a, b);
    assert_eq!(a.len(), 64); // lowercase hex-encoded SHA-256 digest
}

#[test]
fn test_settlement_ref_owner_resolves_correct_plaintext_and_rejects_wrong_one() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    let invoice_id = String::from_str(&env, "invoisio-commitment-resolve");
    let settlement_ref = String::from_str(&env, "settle-commitment-resolve");

    client.set_allow_native(&true);
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // The correct plaintext resolves to the invoice.
    assert_eq!(
        client.settlement_ref_owner(&settlement_ref),
        Some(invoice_id)
    );

    // A wrong/unrelated plaintext — even one of the same length — resolves
    // to nothing: the contract never stored the plaintext to compare against
    // directly, only its commitment.
    let wrong = String::from_str(&env, "settle-wrong-unrelated");
    assert_eq!(client.settlement_ref_owner(&wrong), None);
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with the SAME settlement_ref but different invoice_id fails
    let invoice_id_2 = String::from_str(&env, "inv-002");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer2,
        &Asset::Native,
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(&_admin), 1);
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
    let usdc_issuer = Address::from_string(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ));
    client.allow_asset(&String::from_str(&env, "USDC"), &usdc_issuer);

    let payer = Address::generate(&env);
    let settlement_ref = String::from_str(&env, "settle-cross-asset");

    // First payment with XLM succeeds
    let invoice_id_1 = String::from_str(&env, "inv-xlm");
    client.record_payment(
        &invoice_id_1,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with USDC but same settlement_ref fails
    let invoice_id_2 = String::from_str(&env, "inv-usdc");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer,
        &Asset::Token(String::from_str(&env, "USDC"), usdc_issuer.clone()),
        &50_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(&_admin), 1);
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
        &Asset::Native,
        &10_000_000i128,
        &ref_1,
    );

    // Second payment with different ref
    let invoice_id_2 = String::from_str(&env, "inv-002");
    let ref_2 = String::from_str(&env, "settle-002");
    client.record_payment(
        &invoice_id_2,
        &payer,
        &Asset::Native,
        &20_000_000i128,
        &ref_2,
    );

    // Both payments should succeed
    assert_eq!(client.payment_count(&_admin), 2);
    assert!(client.has_payment(&invoice_id_1));
    assert!(client.has_payment(&invoice_id_2));

    // Verify settlement refs are stored as their commitments, not plaintext.
    let record1 = client.get_payment(&invoice_id_1);
    assert_eq!(
        record1.settlement_ref,
        crate::storage::commit_settlement_ref(&env, &ref_1)
    );

    let record2 = client.get_payment(&invoice_id_2);
    assert_eq!(
        record2.settlement_ref,
        crate::storage::commit_settlement_ref(&env, &ref_2)
    );
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Second payment with different payer but same ref fails
    let invoice_id_2 = String::from_str(&env, "inv-payer2");
    let result = client.try_record_payment(
        &invoice_id_2,
        &payer2,
        &Asset::Native,
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only first payment was recorded
    assert_eq!(client.payment_count(&_admin), 1);
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Attempt duplicate invoice_id with different settlement_ref
    // Should fail with PaymentAlreadyRecorded (invoice_id check fires first)
    let new_ref = String::from_str(&env, "settle-different");
    let result = client.try_record_payment(
        &invoice_id, // same invoice_id
        &payer,
        &Asset::Native,
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
        &Asset::Native,
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(result2, Err(Ok(ContractError::SettlementRefAlreadyUsed)));

    // Verify only one payment was recorded
    assert_eq!(client.payment_count(&_admin), 1);
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
        &Asset::Native,
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
        &Asset::Native,
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
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Verify payment succeeded
    assert_eq!(client.payment_count(&_admin), 1);
    assert!(client.has_payment(&invoice_id_2));
}

// ─── Additional Pause-Scope Tests: Issue #482 ───────────────────────────────

/// `cancel_admin_transfer` — part of the admin control plane — must be
/// rejected while paused, even though it "undoes" a pending change.  The
/// entire control plane is frozen during containment so the operator can
/// reason about a stable state before unpausing.  After unpause the normal
/// cancellation flow must still work.
#[test]
fn test_cancel_admin_transfer_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Stage a proposal while the contract is still operational.
    let proposed = Address::generate(&env);
    client.propose_admin(&proposed);
    assert_eq!(
        client.pending_admin(),
        Some(proposed.clone()),
        "precondition: proposal must be staged while unpaused"
    );

    // Operator pauses — containment window begins.
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // Paused attempt: must fail with ContractPaused and MUST NOT clear the
    // pending proposal (operator inspects it after unpause, then decides).
    let paused_cancel = client.try_cancel_admin_transfer();
    assert_eq!(
        paused_cancel,
        Err(Ok(ContractError::ContractPaused)),
        "cancel_admin_transfer must return ContractPaused while paused"
    );
    assert_eq!(
        client.pending_admin(),
        Some(proposed.clone()),
        "pending_admin must NOT be cleared by a failed paused cancellation"
    );
    assert_eq!(client.admin(), admin, "admin must remain unchanged");

    // Lift containment — cancellation must now succeed normally.
    client.set_paused(&admin, &false);
    client.cancel_admin_transfer();
    assert_eq!(client.pending_admin(), None);
}

/// `upgrade_storage` is deliberately **exempt** from the pause guard.
/// The documented upgrade runbook is:
///   `set_paused(true) → upgrade() → upgrade_storage() → verify → set_paused(false)`
/// so storage migration literally *must* run while paused.  Blocking it
/// would make the runbook impossible.  Here we assert the exemption holds.
#[test]
fn test_upgrade_storage_succeeds_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // Follow the runbook order: pause first, then migrate storage.
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    // upgrade_storage must NOT be blocked by pause.
    let migrate = client.try_upgrade_storage(&admin);
    assert!(
        migrate.is_ok(),
        "upgrade_storage must succeed while paused (exempt per upgrade runbook)"
    );

    // Sanity: schema metadata matches current code, confirming migration ran.
    let cfg = client.config();
    assert_eq!(
        cfg.version.storage_schema_version, STORAGE_SCHEMA_VERSION,
        "storage schema must be current after a paused migration"
    );
    assert!(
        client.is_paused(),
        "contract must remain paused after migration"
    );
}

/// `rebuild_history_index` is deliberately **exempt** from the pause guard.
/// It is an admin-gated maintenance / recovery function that may be needed
/// either inside the pause→upgrade→migrate→verify→unpause window or
/// standalone during normal operation.  Here we seed payments, pause, and
/// confirm the rebuild call is permitted and restores a consistent index.
#[test]
fn test_rebuild_history_index_succeeds_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    // ── Seed payments (unpaused) ────────────────────────────────────────
    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    const N: u32 = 3;
    for i in 0..N {
        let inv = String::from_str(&env, &format!("rebuild-pause-{:02}", i));
        let set = String::from_str(&env, &format!("set-rebuild-pause-{:02}", i));
        client.record_payment(
            &inv,
            &payer,
            &Asset::Native,
            &((i as i128 + 1) * 10_000_000i128),
            &set,
        );
    }
    let before = client.payment_history(&admin, &0u32, &25u32);
    assert_eq!(
        before.records.len() as u32,
        N,
        "precondition: N payments recorded"
    );

    // Wipe the history index entries (simulate corruption that rebuild fixes).
    env.as_contract(&client.address, || {
        for i in 0..N {
            env.storage()
                .persistent()
                .remove(&DataKey::PaymentHistory(i));
        }
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &0u32);
    });
    let cleared = client.payment_history(&admin, &0u32, &25u32);
    assert_eq!(
        cleared.records.len(),
        0,
        "precondition: history index cleared"
    );

    // ── Pause, then rebuild — must NOT be blocked ───────────────────────
    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let rebuild = client.try_rebuild_history_index(&admin);
    assert!(
        rebuild.is_ok(),
        "rebuild_history_index must succeed while paused (exempt maintenance function)"
    );

    // Verify the index was actually rebuilt during the paused window.
    let restored = client.payment_history(&admin, &0u32, &25u32);
    assert_eq!(
        restored.records.len() as u32,
        N,
        "history index must be fully restored by a paused rebuild"
    );
    assert_eq!(
        restored.gaps_skipped, 0,
        "restored history must report zero gaps"
    );
    assert!(
        client.is_paused(),
        "contract must remain paused after rebuild"
    );
}

// ─── invoice_id / settlement_ref canonicalisation (issue #497) ─────────────

#[test]
fn test_invoice_id_exactly_max_len_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    // Exactly MAX_INVOICE_ID_LEN (64) chars, canonical — should be accepted.
    let invoice_id = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert_eq!(invoice_id.len(), storage::MAX_INVOICE_ID_LEN);

    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-max-len-invoice-id"),
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.invoice_id, invoice_id);
}

#[test]
fn test_invoice_id_over_max_len_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    // MAX_INVOICE_ID_LEN (64) + 1 chars — must be rejected.
    let invoice_id = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert_eq!(invoice_id.len(), storage::MAX_INVOICE_ID_LEN + 1);

    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-over-max-len-invoice-id"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_invoice_id_uppercase_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, "INV-CANON-001"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-uppercase"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_invoice_id_leading_whitespace_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, " inv-canon-002"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-leading-ws"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_invoice_id_trailing_whitespace_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, "inv-canon-003 "),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-trailing-ws"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_invoice_id_embedded_whitespace_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, "inv canon 004"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-embedded-ws"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
}

#[test]
fn test_invoice_id_case_variant_cannot_defeat_idempotency_guard() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    client.record_payment(
        &String::from_str(&env, "inv-canon-dup"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-dup-1"),
    );

    // A case variant of the same invoice_id must be rejected outright as
    // non-canonical — it must NOT be accepted as a second, distinct record.
    let result = client.try_record_payment(
        &String::from_str(&env, "INV-CANON-DUP"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-dup-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
    assert_eq!(client.payment_count(&_admin), 1);
}

#[test]
fn test_invoice_id_whitespace_variant_cannot_defeat_idempotency_guard() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    client.record_payment(
        &String::from_str(&env, "inv-canon-ws-dup"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-ws-dup-1"),
    );

    // A whitespace variant of the same invoice_id must be rejected outright
    // as non-canonical — it must NOT be accepted as a second, distinct record.
    let result = client.try_record_payment(
        &String::from_str(&env, "inv-canon-ws-dup "),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-ws-dup-2"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidInvoiceId)));
    assert_eq!(client.payment_count(&_admin), 1);
}

#[test]
fn test_settlement_ref_uppercase_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-canon-ref-001"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "SETTLE-CANON-001"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

#[test]
fn test_settlement_ref_whitespace_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-canon-ref-002"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle canon 002"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

#[test]
fn test_settlement_ref_invalid_format_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    // Underscore and '+' are not in the canonical charset (a-z0-9-).
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-canon-ref-003"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle_canon+003"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
}

#[test]
fn test_settlement_ref_case_variant_cannot_defeat_uniqueness_guard() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    client.record_payment(
        &String::from_str(&env, "invoisio-canon-ref-dup-1"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-ref-dup"),
    );

    // A case variant of the same settlement_ref must be rejected outright as
    // non-canonical — it must NOT be accepted as a "different" reference for
    // a second invoice.
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-canon-ref-dup-2"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "SETTLE-CANON-REF-DUP"),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
    assert_eq!(client.payment_count(&_admin), 1);
}

#[test]
fn test_settlement_ref_whitespace_variant_cannot_defeat_uniqueness_guard() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    client.record_payment(
        &String::from_str(&env, "invoisio-canon-ref-ws-1"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-ref-ws"),
    );

    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-canon-ref-ws-2"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-canon-ref-ws "),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidSettlementRef)));
    assert_eq!(client.payment_count(&_admin), 1);
}

#[test]
fn test_is_canonical_identifier_accepts_lowercase_alnum_hyphen_only() {
    let env = Env::default();

    assert!(storage::is_canonical_identifier(&String::from_str(
        &env, "abc-123"
    )));
    assert!(!storage::is_canonical_identifier(&String::from_str(
        &env, "Abc-123"
    )));
    assert!(!storage::is_canonical_identifier(&String::from_str(
        &env, "abc_123"
    )));
    assert!(!storage::is_canonical_identifier(&String::from_str(
        &env, "abc 123"
    )));
    assert!(!storage::is_canonical_identifier(&String::from_str(
        &env, " abc123"
    )));
    assert!(!storage::is_canonical_identifier(&String::from_str(
        &env, "abc123 "
    )));
}

// ─── settlement_ref resolvability (issue #495) ─────────────────────────────

#[test]
fn test_settlement_ref_owner_resolves_to_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let invoice_id = String::from_str(&env, "invoisio-owner-001");
    let settlement_ref = String::from_str(&env, "settle-owner-001");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    assert_eq!(
        client.settlement_ref_owner(&settlement_ref),
        Some(invoice_id)
    );
}

#[test]
fn test_settlement_ref_owner_returns_none_for_unused_reference() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let unused = String::from_str(&env, "settle-never-used");
    assert_eq!(client.settlement_ref_owner(&unused), None);
}

#[test]
fn test_settlement_ref_owner_returns_none_for_empty_string() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    assert_eq!(
        client.settlement_ref_owner(&String::from_str(&env, "")),
        None
    );
}

/// Core acceptance scenario for #495: a `SettlementRefAlreadyUsed` rejection
/// is ambiguous on its own, but `settlement_ref_owner` disambiguates a
/// benign retry (owner equals the invoice just attempted) from a genuine
/// reconciliation conflict (owner is a different invoice).
#[test]
fn test_settlement_ref_owner_distinguishes_retry_from_conflict() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let invoice_a = String::from_str(&env, "invoisio-recon-a");
    let settlement_ref = String::from_str(&env, "settle-recon-shared");
    client.record_payment(
        &invoice_a,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // Retry: same invoice, same settlement_ref. Rejected by the invoice_id
    // guard (fires first), and the owner is unchanged — a caller comparing
    // the owner to the invoice_id it just attempted sees they match, i.e.
    // "this already succeeded".
    let retry = client.try_record_payment(
        &invoice_a,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );
    assert_eq!(retry, Err(Ok(ContractError::PaymentAlreadyRecorded)));
    assert_eq!(
        client.settlement_ref_owner(&settlement_ref),
        Some(invoice_a.clone())
    );

    // Conflict: a different invoice claims the same settlement_ref. Rejected
    // by the settlement-reference guard, and the owner still names invoice_a
    // — a caller comparing the owner to invoice_b (what it just attempted)
    // sees they differ, i.e. "this is a real conflict".
    let invoice_b = String::from_str(&env, "invoisio-recon-b");
    let conflict = client.try_record_payment(
        &invoice_b,
        &payer,
        &Asset::Native,
        &20_000_000i128,
        &settlement_ref,
    );
    assert_eq!(conflict, Err(Ok(ContractError::SettlementRefAlreadyUsed)));
    assert_eq!(
        client.settlement_ref_owner(&settlement_ref),
        Some(invoice_a)
    );
    assert_eq!(client.payment_count(&_admin), 1);
}

#[test]
fn test_settlement_ref_history_pages_in_write_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    for idx in 0..5u32 {
        record_xlm(
            &env,
            &client,
            &format!("invoisio-refhist-{idx:02}"),
            &payer,
            10_000_000i128,
        );
    }

    let mut collected: alloc::vec::Vec<storage::SettlementRefEntry> = alloc::vec::Vec::new();
    let mut cursor = 0u32;
    loop {
        let page = client.settlement_ref_history(&_admin, &cursor, &2u32);
        assert!(page.records.len() as u32 <= 2);
        assert_eq!(page.gaps_skipped, 0);
        collected.extend(page.records.iter());
        cursor = page.next_cursor;
        if !page.has_more {
            break;
        }
    }

    assert_eq!(collected.len(), 5);
    for (idx, entry) in collected.iter().enumerate() {
        assert_eq!(
            entry.invoice_id,
            String::from_str(&env, &format!("invoisio-refhist-{idx:02}"))
        );
        assert_eq!(
            entry.settlement_ref,
            settlement_commitment(
                &env,
                &format!("settle-xlm-default-invoisio-refhist-{idx:02}")
            )
        );
    }
}

#[test]
fn test_settlement_ref_history_skips_missing_slot() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    for idx in 0..5u32 {
        record_xlm(
            &env,
            &client,
            &format!("invoisio-refgap-{idx:02}"),
            &payer,
            10_000_000i128,
        );
    }

    // Corrupt slot 2 only, leaving the count untouched.
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::SettlementRefLog(2));
    });

    let page = client.settlement_ref_history(&_admin, &0u32, &10u32);
    assert_eq!(page.records.len(), 4);
    assert_eq!(page.gaps_skipped, 1);
    assert_eq!(page.next_cursor, 5);
    assert!(!page.has_more);
}

#[test]
fn test_settlement_ref_history_empty_index_terminates_immediately() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    env.mock_all_auths();

    let page = client.settlement_ref_history(&_admin, &0u32, &10u32);
    assert_eq!(page.records.len(), 0);
    assert_eq!(page.next_cursor, 0);
    assert!(!page.has_more);
    assert_eq!(page.gaps_skipped, 0);
}

#[test]
fn test_settlement_ref_index_status_consistent_after_payments() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    assert_eq!(client.settlement_ref_index_status(&_admin), (0, 0, true));

    for idx in 0..4u32 {
        record_xlm(
            &env,
            &client,
            &format!("invoisio-refstatus-{idx:02}"),
            &payer,
            10_000_000i128,
        );
    }

    assert_eq!(client.settlement_ref_index_status(&_admin), (4, 4, true));
}

/// Regression for #495: a genuine duplicate settlement_ref in raw legacy
/// (pre-guard) data must not let the later payment silently overwrite the
/// earlier payment's ownership during the V0 → V1 migration step.
#[test]
fn test_migrate_settlement_refs_skips_conflicting_duplicate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let invoice_a = String::from_str(&env, "invoisio-legacy-conflict-a");
    let invoice_b = String::from_str(&env, "invoisio-legacy-conflict-b");
    let shared_ref = String::from_str(&env, "settle-legacy-conflict-shared");

    client.record_payment(
        &invoice_a,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &shared_ref,
    );
    client.record_payment(
        &invoice_b,
        &payer,
        &Asset::Native,
        &20_000_000i128,
        &String::from_str(&env, "settle-legacy-conflict-original-b"),
    );

    // Simulate raw pre-guard legacy data where both A and B's stored records
    // carry the *plaintext* settlement_ref, and it's the same for both
    // (impossible to produce via `record_payment` today, but exactly what
    // the uniqueness guard exists to prevent going forward — see issue
    // #495's background). Pre-commitment (issue #512) legacy data stored the
    // plaintext directly in `PaymentRecord.settlement_ref`, which is what
    // `migrate_settlement_refs` expects to read and hash. Also roll back the
    // settlement-reference index itself, so the upgrade below discovers and
    // resolves the conflict for the first time, rather than finding A's
    // entry already present from the calls above.
    env.as_contract(&client.address, || {
        let mut record_a: PaymentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::PaymentV1(invoice_a.clone()))
            .unwrap();
        record_a.settlement_ref = shared_ref.clone();
        env.storage()
            .persistent()
            .set(&DataKey::PaymentV1(invoice_a.clone()), &record_a);

        let mut record_b: PaymentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::PaymentV1(invoice_b.clone()))
            .unwrap();
        record_b.settlement_ref = shared_ref.clone();
        env.storage()
            .persistent()
            .set(&DataKey::PaymentV1(invoice_b.clone()), &record_b);

        env.storage()
            .persistent()
            .remove(&DataKey::SettlementRef(storage::commit_settlement_ref(
                &env,
                &shared_ref,
            )));
        env.storage()
            .persistent()
            .remove(&DataKey::SettlementRef(storage::commit_settlement_ref(
                &env,
                &String::from_str(&env, "settle-legacy-conflict-original-b"),
            )));
        for i in 0..storage::get_settlement_ref_count(&env) {
            env.storage()
                .persistent()
                .remove(&DataKey::SettlementRefLog(i));
        }
        storage::set_settlement_ref_count(&env, 0);

        let mut meta =
            storage::get_contract_meta(&env).unwrap_or_else(storage::current_contract_meta);
        meta.storage_schema_version = 0;
        storage::set_contract_meta(&env, &meta);
    });

    client.upgrade_storage(&admin);

    // First writer (A, earlier in payment-log order) keeps ownership.
    assert_eq!(
        client.settlement_ref_owner(&shared_ref),
        Some(invoice_a.clone())
    );

    // The index is now visibly inconsistent (B has no mapping) — exactly the
    // signal an operator needs to investigate, rather than a silent
    // overwrite masking the conflict.
    let (settlement_ref_count, payment_count, is_consistent) =
        client.settlement_ref_index_status(&admin);
    assert_eq!(settlement_ref_count, 1);
    assert_eq!(payment_count, 2);
    assert!(!is_consistent);

    let (verified, mismatched) = env.as_contract(&client.address, || {
        migration::verify_settlement_ref_index(&env)
    });
    assert_eq!(verified, 1);
    assert_eq!(mismatched, 1);
}

/// Regression for #495: the V2 → V3 migration backfills the invoice_id
/// mapping for settlement references recorded under the old unit-value
/// shape, and rebuilds the enumeration log so every pre-existing reference
/// becomes resolvable and page-able, not just ones recorded after upgrade.
#[test]
fn test_migrate_schema_v2_to_v3_backfills_settlement_ref_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let payer = Address::generate(&env);
    client.set_allow_native(&true);

    let invoice_ids: alloc::vec::Vec<String> = (0..3u32)
        .map(|idx| String::from_str(&env, &format!("invoisio-v2v3-{idx:02}")))
        .collect();
    let refs: alloc::vec::Vec<String> = (0..3u32)
        .map(|idx| String::from_str(&env, &format!("settle-v2v3-{idx:02}")))
        .collect();

    for idx in 0..3usize {
        client.record_payment(
            &invoice_ids[idx],
            &payer,
            &Asset::Native,
            &10_000_000i128,
            &refs[idx],
        );
    }

    // Roll every settlement_ref entry back to the pre-V3 unit-value shape,
    // and clear the enumeration log/counter (neither existed before V3), to
    // simulate a genuine V2 deployment. A genuine pre-#512 V2 deployment also
    // stored the *plaintext* settlement_ref directly on `PaymentRecord` (the
    // commitment scheme didn't exist yet) — roll that back too, since
    // `migrate_schema_v2_to_v3` derives everything it writes from
    // `PaymentRecord.settlement_ref`, not from the raw `SettlementRef` keys.
    env.as_contract(&client.address, || {
        for (idx, r) in refs.iter().enumerate() {
            env.storage()
                .persistent()
                .set(&DataKey::SettlementRef(r.clone()), &());

            let mut record: PaymentRecord = env
                .storage()
                .persistent()
                .get(&DataKey::PaymentV1(invoice_ids[idx].clone()))
                .unwrap();
            record.settlement_ref = r.clone();
            env.storage()
                .persistent()
                .set(&DataKey::PaymentV1(invoice_ids[idx].clone()), &record);
        }
        for i in 0..storage::get_settlement_ref_count(&env) {
            env.storage()
                .persistent()
                .remove(&DataKey::SettlementRefLog(i));
        }
        storage::set_settlement_ref_count(&env, 0);

        let mut meta =
            storage::get_contract_meta(&env).unwrap_or_else(storage::current_contract_meta);
        meta.storage_schema_version = storage::STORAGE_SCHEMA_V2;
        storage::set_contract_meta(&env, &meta);
    });
    assert_eq!(
        client.version_info().storage_schema_version,
        storage::STORAGE_SCHEMA_V2
    );

    client.upgrade_storage(&admin);

    assert_eq!(
        client.version_info().storage_schema_version,
        storage::STORAGE_SCHEMA_VERSION
    );

    for idx in 0..3usize {
        assert_eq!(
            client.settlement_ref_owner(&refs[idx]),
            Some(invoice_ids[idx].clone())
        );
    }

    let page = client.settlement_ref_history(&admin, &0u32, &25u32);
    assert_eq!(page.records.len(), 3);
    assert!(!page.has_more);
    assert_eq!(page.gaps_skipped, 0);
    for (idx, entry) in page.records.iter().enumerate() {
        assert_eq!(entry.invoice_id, invoice_ids[idx]);
        assert_eq!(
            entry.settlement_ref,
            crate::storage::commit_settlement_ref(&env, &refs[idx])
        );
    }

    assert_eq!(client.settlement_ref_index_status(&admin), (3, 3, true));
}

// ─── migrate_legacy_payments (issue #508) ──────────────────────────────────

/// Seed a raw legacy `Payment(invoice_id)` entry, bypassing `record_payment`
/// entirely — this is what a genuinely pre-schema-versioning record looks
/// like, with no corresponding `PaymentLog`/`PaymentCount` entry.
fn seed_legacy_payment(env: &Env, client: &InvoicePaymentContractClient, invoice_id: &String) {
    let payer = Address::generate(env);
    let record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer,
        asset: Asset::Native,
        amount: 1_000_000i128,
        asset_decimals: 7,
        timestamp: 1u64,
        settlement_ref: String::from_str(env, "legacy-seed"),
    };
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Payment(invoice_id.clone()), &record);
    });
}

#[test]
fn test_migrate_legacy_payments_reports_not_found_for_unknown_id() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let unknown = String::from_str(&env, "invoisio-never-existed");
    let (migrated, already_current, not_found) =
        client.migrate_legacy_payments(&admin, &soroban_sdk::vec![&env, unknown]);
    assert_eq!((migrated, already_current, not_found), (0, 0, 1));
}

#[test]
fn test_migrate_legacy_payments_rejects_non_admin() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let attacker = Address::generate(&env);

    let invoice_id = String::from_str(&env, "invoisio-legacy-auth");
    seed_legacy_payment(&env, &client, &invoice_id);

    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &attacker,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &client.address,
            fn_name: "migrate_legacy_payments",
            args: (
                attacker.clone(),
                soroban_sdk::vec![&env, invoice_id.clone()],
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result =
        client.try_migrate_legacy_payments(&attacker, &soroban_sdk::vec![&env, invoice_id.clone()]);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));

    // The legacy record must be untouched by the rejected attempt.
    let (has_v1, has_legacy) = env.as_contract(&client.address, || {
        (
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(invoice_id.clone())),
            env.storage()
                .persistent()
                .has(&DataKey::Payment(invoice_id.clone())),
        )
    });
    assert!(!has_v1);
    assert!(has_legacy);
}

#[test]
fn test_migrate_legacy_payments_rejects_batch_over_max() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let mut ids: soroban_sdk::Vec<String> = soroban_sdk::vec![&env];
    for i in 0..(storage::MAX_LEGACY_MIGRATION_BATCH + 1) {
        ids.push_back(String::from_str(&env, &format!("invoisio-batch-{i:03}")));
    }

    let result = client.try_migrate_legacy_payments(&admin, &ids);
    assert_eq!(
        result,
        Err(Ok(ContractError::LegacyPaymentMigrationBatchTooLarge))
    );
}

#[test]
fn test_migrate_legacy_payments_accepts_batch_at_max() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let mut ids: soroban_sdk::Vec<String> = soroban_sdk::vec![&env];
    for i in 0..storage::MAX_LEGACY_MIGRATION_BATCH {
        let id = String::from_str(&env, &format!("invoisio-batch-{i:03}"));
        seed_legacy_payment(&env, &client, &id);
        ids.push_back(id);
    }

    let (migrated, already_current, not_found) = client.migrate_legacy_payments(&admin, &ids);
    assert_eq!(migrated, storage::MAX_LEGACY_MIGRATION_BATCH);
    assert_eq!(already_current, 0);
    assert_eq!(not_found, 0);
}

#[test]
fn test_migrate_legacy_payments_handles_mixed_batch() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let to_migrate = String::from_str(&env, "invoisio-legacy-mixed-a");
    seed_legacy_payment(&env, &client, &to_migrate);

    // Already-current: record a real payment via the normal write path, so
    // it's already under PaymentV1.
    client.set_allow_native(&true);
    let already_current_id = String::from_str(&env, "invoisio-legacy-mixed-b");
    client.record_payment(
        &already_current_id,
        &Address::generate(&env),
        &Asset::Native,
        &5_000_000i128,
        &String::from_str(&env, "settle-mixed-b"),
    );

    let unknown_id = String::from_str(&env, "invoisio-legacy-mixed-c");

    let batch = soroban_sdk::vec![
        &env,
        to_migrate.clone(),
        already_current_id.clone(),
        unknown_id
    ];
    let (migrated, already_current, not_found) = client.migrate_legacy_payments(&admin, &batch);
    assert_eq!(migrated, 1);
    assert_eq!(already_current, 1);
    assert_eq!(not_found, 1);

    let (has_v1, has_legacy) = env.as_contract(&client.address, || {
        (
            env.storage()
                .persistent()
                .has(&DataKey::PaymentV1(to_migrate.clone())),
            env.storage()
                .persistent()
                .has(&DataKey::Payment(to_migrate.clone())),
        )
    });
    assert!(has_v1);
    assert!(!has_legacy);
}

#[test]
fn test_migrate_legacy_payments_before_init_returns_not_initialized() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(InvoicePaymentContract, ());
    let client = InvoicePaymentContractClient::new(&env, &contract_id);

    let result = client.try_migrate_legacy_payments(
        &admin,
        &soroban_sdk::vec![&env, String::from_str(&env, "invoisio-x")],
    );
    assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
}

#[test]
fn test_migrate_legacy_payments_works_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let invoice_id = String::from_str(&env, "invoisio-legacy-paused-mig");
    seed_legacy_payment(&env, &client, &invoice_id);

    client.set_paused(&admin, &true);
    assert!(client.is_paused());

    let result = client.try_migrate_legacy_payments(&admin, &soroban_sdk::vec![&env, invoice_id]);
    assert!(
        result.is_ok(),
        "migrate_legacy_payments must be exempt from the pause guard"
    );
}

/// Regression for #508: exercising every read method (permissionless and
/// admin-gated) must leave every counter and the legacy-record key layout
/// exactly as it was. TTL extension is the only footprint effect any of
/// these may have, and TTL has no observable value here, so an unchanged
/// counter/key set is a direct proxy for "no data write happened".
#[test]
fn test_permissionless_reads_do_not_mutate_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_allow_native(&true);
    client.allow_asset(
        &String::from_str(&env, "USDC"),
        &Address::from_string(&String::from_str(
            &env,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        )),
    );

    let payer = Address::generate(&env);
    let invoice_id = String::from_str(&env, "invoisio-readonly-001");
    let settlement_ref = String::from_str(&env, "settle-readonly-001");
    client.record_payment(
        &invoice_id,
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &settlement_ref,
    );

    // A legacy record too, so get_payment/has_payment exercise the fallback
    // path specifically.
    let legacy_id = String::from_str(&env, "invoisio-readonly-legacy");
    seed_legacy_payment(&env, &client, &legacy_id);

    let snapshot = || {
        (
            client.payment_count(&admin),
            client.settlement_ref_index_status(&admin),
            client.allowlist_count(),
            client.history_index_status(&admin),
            env.as_contract(&client.address, || {
                (
                    env.storage()
                        .persistent()
                        .has(&DataKey::PaymentV1(legacy_id.clone())),
                    env.storage()
                        .persistent()
                        .has(&DataKey::Payment(legacy_id.clone())),
                )
            }),
        )
    };

    let before = snapshot();

    // Exercise every read method — permissionless and admin-gated alike.
    let _ = client.get_payment(&invoice_id);
    let _ = client.get_payment(&legacy_id);
    let _ = client.has_payment(&invoice_id);
    let _ = client.has_payment(&legacy_id);
    let _ = client.payment_count(&admin);
    let _ = client.payment_history(&admin, &0u32, &10u32);
    let _ = client.settlement_ref_owner(&settlement_ref);
    let _ = client.settlement_ref_history(&admin, &0u32, &10u32);
    let _ = client.settlement_ref_index_status(&admin);
    let _ = client.allowed_assets(&0u32, &10u32);
    let _ = client.allowlist_count();
    let _ = client.contract_version();
    let _ = client.version_info();
    let _ = client.admin();
    let _ = client.pending_admin();
    let _ = client.config();
    let _ = client.is_paused();
    let _ = client.history_index_status(&admin);

    let after = snapshot();
    assert_eq!(
        before, after,
        "no read may change a counter or the legacy-key layout"
    );

    // The admin/write path is unaffected by this — confirm a fresh admin
    // action still works normally afterward.
    let result =
        client.try_migrate_legacy_payments(&admin, &soroban_sdk::vec![&env, legacy_id.clone()]);
    assert!(result.is_ok());
}

fn circle_usdc_issuer(env: &Env) -> Address {
    Address::from_string(&String::from_str(
        env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ))
}

/// A garbage issuer string is not an [`Address`], so it cannot be
/// allowlisted or recorded.
#[test]
fn test_malformed_issuer_cannot_be_parsed_or_allowlisted() {
    let env = Env::default();
    assert!(storage::try_parse_issuer_address(&String::from_str(&env, "not-an-address")).is_none());
    assert!(storage::try_parse_issuer_address(&String::from_str(&env, "")).is_none());
    assert!(storage::try_parse_issuer_address(&String::from_str(&env, " GBIssuer ")).is_none());
    assert!(storage::try_parse_issuer_address(&String::from_str(
        &env,
        "gbbd47if6lwk7p7mdevscwr7dpuwv3ny3dtqevfl4nat4aqh3zllfla5"
    ))
    .is_none());
    assert!(storage::try_parse_issuer_address(&String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    ))
    .is_some());
}

/// The same Stellar issuer constructed twice is one allowlist key — Address
/// is canonical, so case/spelling variants cannot fork the list.
#[test]
fn test_issuer_address_is_canonical_allowlist_key() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let code = String::from_str(&env, "USDC");
    let a = circle_usdc_issuer(&env);
    let b = circle_usdc_issuer(&env);
    assert_eq!(a, b);

    client.allow_asset(&code, &a);
    assert_eq!(client.allowlist_count(), 1);
    client.allow_asset(&code, &b);
    assert_eq!(client.allowlist_count(), 1);

    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "inv-canonical-issuer"),
        &payer,
        &Asset::Token(code.clone(), b.clone()),
        &1_000_000i128,
        &String::from_str(&env, "settle-canonical-issuer"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-canonical-issuer")));
}

/// Native XLM is `Asset::Native` — there is no empty-issuer field.
#[test]
fn test_native_asset_has_no_issuer_field() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    client.set_allow_native(&true);
    let payer = Address::generate(&env);
    client.record_payment(
        &String::from_str(&env, "inv-native-struct"),
        &payer,
        &Asset::Native,
        &10_000_000i128,
        &String::from_str(&env, "settle-native-struct"),
    );
    match client
        .get_payment(&String::from_str(&env, "inv-native-struct"))
        .asset
    {
        Asset::Native => {}
        Asset::Token(_, _) => panic!("native payment must not store a Token variant"),
    }
}

/// Pre-V6 string-issuer payment records and allowlist entries are rewritten
/// to Address without data loss.
#[test]
fn test_migrate_schema_v5_to_v6_rewrites_string_issuers() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-legacy-issuer");
    let payer = Address::generate(&env);
    let code = String::from_str(&env, "USDC");
    let issuer_str = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    let issuer = circle_usdc_issuer(&env);

    let legacy = storage::LegacyStringIssuerPayment {
        invoice_id: invoice_id.clone(),
        payer: payer.clone(),
        asset: storage::LegacyAsset::Token(code.clone(), issuer_str.clone()),
        amount: 42_000_000i128,
        asset_decimals: 7,
        timestamp: 9_001u64,
        settlement_ref: String::from_str(&env, "legacy-issuer-ref"),
    };

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::PaymentV1(invoice_id.clone()), &legacy);
        env.storage()
            .persistent()
            .set(&DataKey::PaymentLog(0u32), &invoice_id);
        env.storage()
            .persistent()
            .set(&DataKey::PaymentHistory(0u32), &legacy);
        env.storage().instance().set(&DataKey::PaymentCount, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &1u32);
        env.storage()
            .persistent()
            .set(&DataKey::AllowList(code.clone(), issuer_str.clone()), &7u32);

        let mut meta =
            storage::get_contract_meta(&env).unwrap_or_else(storage::current_contract_meta);
        meta.storage_schema_version = storage::STORAGE_SCHEMA_V5;
        storage::set_contract_meta(&env, &meta);
    });

    // Readable via the dual-read fallback before migration.
    let before = client.get_payment(&invoice_id);
    assert_eq!(before.asset, Asset::Token(code.clone(), issuer.clone()));
    assert_eq!(before.amount, 42_000_000i128);

    client.upgrade_storage(&admin);
    assert_eq!(
        client.version_info().storage_schema_version,
        STORAGE_SCHEMA_VERSION
    );

    let after = client.get_payment(&invoice_id);
    assert_eq!(after.asset, Asset::Token(code.clone(), issuer.clone()));
    assert_eq!(after.payer, payer);
    assert_eq!(after.amount, 42_000_000i128);

    // New writes against the migrated allowlist succeed.
    client.record_payment(
        &String::from_str(&env, "inv-post-migrate"),
        &payer,
        &Asset::Token(code, issuer),
        &1i128,
        &String::from_str(&env, "settle-post-migrate"),
    );
    assert!(client.has_payment(&String::from_str(&env, "inv-post-migrate")));
}
