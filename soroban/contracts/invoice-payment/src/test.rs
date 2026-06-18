#![cfg(test)]
#![allow(clippy::all)]

use super::*;
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
            initialized: false,
            version: ContractMeta {
                contract_version: 0,
                storage_schema_version: 0,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: false,
                requires_token_allowlist: true,
            },
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
            initialized: true,
            version: ContractMeta {
                contract_version: CONTRACT_VERSION,
                storage_schema_version: STORAGE_SCHEMA_VERSION,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: false,
                requires_token_allowlist: true,
            },
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
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.invoice_id, invoice_id);
    assert_eq!(record.payer, payer);
    assert_eq!(record.asset, Asset::Native);
    assert_eq!(record.amount, 10_000_000i128);
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
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(
        record.asset,
        Asset::Token(String::from_str(&env, "USDC"), issuer.clone(),)
    );
    assert_eq!(record.amount, 50_000_000i128);
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

// payments_by_payer

#[test]
fn test_payments_by_payer_filters_to_single_payer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer_a = Address::generate(&env);
    let payer_b = Address::generate(&env);

    record_xlm(&env, &client, "invoisio-payer-a-001", &payer_a, 10_000_000);
    record_xlm(&env, &client, "invoisio-payer-b-001", &payer_b, 20_000_000);
    record_xlm(&env, &client, "invoisio-payer-a-002", &payer_a, 30_000_000);

    let page = client.payments_by_payer(&payer_a, &0u32, &10u32);
    assert_eq!(page.records.len(), 2);
    assert_eq!(
        page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-a-001")
    );
    assert_eq!(
        page.records.get(1).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-a-002")
    );
    assert!(!page.has_more);

    let page_b = client.payments_by_payer(&payer_b, &0u32, &10u32);
    assert_eq!(page_b.records.len(), 1);
    assert_eq!(
        page_b.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-b-001")
    );
}

#[test]
fn test_payments_by_payer_pages_deterministically() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..3u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-payer-history-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &((idx as i128 + 1) * 10_000_000i128),
        );
    }

    let first_page = client.payments_by_payer(&payer, &0u32, &2u32);
    assert_eq!(first_page.records.len(), 2);
    assert_eq!(first_page.next_cursor, 2);
    assert!(first_page.has_more);
    assert_eq!(
        first_page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-history-00")
    );
    assert_eq!(
        first_page.records.get(1).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-history-01")
    );

    let second_page = client.payments_by_payer(&payer, &first_page.next_cursor, &2u32);
    assert_eq!(second_page.records.len(), 1);
    assert_eq!(second_page.next_cursor, 3);
    assert!(!second_page.has_more);
    assert_eq!(
        second_page.records.get(0).unwrap().invoice_id,
        String::from_str(&env, "invoisio-payer-history-02")
    );

    let empty_page = client.payments_by_payer(&payer, &99u32, &2u32);
    assert_eq!(empty_page.records.len(), 0);
    assert_eq!(empty_page.next_cursor, 3);
    assert!(!empty_page.has_more);
}

#[test]
fn test_payments_by_payer_unknown_payer_returns_empty_page() {
    let env = Env::default();
    let (client, _admin) = setup(&env);

    let unknown_payer = Address::generate(&env);
    let page = client.payments_by_payer(&unknown_payer, &0u32, &10u32);
    assert_eq!(page.records.len(), 0);
    assert_eq!(page.next_cursor, 0);
    assert!(!page.has_more);
}

#[test]
fn test_payments_by_payer_page_size_is_capped() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    client.set_allow_native(&true);
    let payer = Address::generate(&env);

    for idx in 0..26u32 {
        let invoice_id = String::from_str(&env, &format!("invoisio-payer-cap-{idx:02}"));
        client.record_payment(
            &invoice_id,
            &payer,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, ""),
            &(10_000_000i128 + idx as i128),
        );
    }

    let first_page = client.payments_by_payer(&payer, &0u32, &100u32);
    assert_eq!(first_page.records.len(), 25);
    assert_eq!(first_page.next_cursor, 25);
    assert!(first_page.has_more);

    let second_page = client.payments_by_payer(&payer, &first_page.next_cursor, &100u32);
    assert_eq!(second_page.records.len(), 1);
    assert_eq!(second_page.next_cursor, 26);
    assert!(!second_page.has_more);
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
    );

    // Check event BEFORE any further contract call; env.events().all() returns
    // events from the last invocation only and is overwritten on the next call.
    let inv_val: soroban_sdk::Val = invoice_id.clone().into_val(&env);
    let pyr_val: soroban_sdk::Val = payer.clone().into_val(&env);
    let code_val: soroban_sdk::Val = String::from_str(&env, "XLM").into_val(&env);
    let iss_val: soroban_sdk::Val = String::from_str(&env, "").into_val(&env);
    let amt_val: soroban_sdk::Val = 10_000_000i128.into_val(&env);
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
                    (Symbol::new(&env, "amount"), amt_val)
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
    );
    assert_eq!(client.payment_count(), 1);

    // Second payment with the identical invoice_id — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128,
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
    );
    assert_eq!(client.payment_count(), 1);

    // Second attempt: same invoice_id but USDC — must fail.
    let result = client.try_record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &usdc_issuer,
        &50_000_000i128,
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

// Admin management

#[test]
fn test_set_admin_updates_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _old_admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin);

    assert_eq!(client.admin(), new_admin);
}

#[test]
fn test_new_admin_can_record_payment() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _old_admin) = setup(&env);

    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin);

    // With mock_all_auths the new admin's require_auth passes automatically.
    let payer = Address::generate(&env);
    record_xlm(&env, &client, "invoisio-new-admin", &payer, 7_000_000);

    assert_eq!(client.payment_count(), 1);
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
    );

    // env.events().all() returns events from the LAST contract invocation only.
    // We must assert BEFORE making any further contract call (e.g. get_payment),
    // otherwise the buffer is overwritten with that call's (empty) events.

    let inv_val: soroban_sdk::Val = invoice_id.into_val(&env);
    let pyr_val: soroban_sdk::Val = payer.into_val(&env);
    let code_val: soroban_sdk::Val = String::from_str(&env, "XLM").into_val(&env);
    let iss_val: soroban_sdk::Val = String::from_str(&env, "").into_val(&env);
    let amt_val: soroban_sdk::Val = 10_000_000i128.into_val(&env);

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
                    (Symbol::new(&env, "amount"), amt_val)
                ]
                .into_val(&env),
            ),
        ]
    );
}

// Admin — set_admin co-sign

#[test]
fn test_set_admin_requires_new_admin_auth() {
    let env = Env::default();
    let (client, old_admin) = setup(&env);
    let new_admin = Address::generate(&env);

    // Only mock the current admin's auth — new_admin does NOT co-sign.
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &old_admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Without new_admin's auth the host must reject the call.
    let result = client.try_set_admin(&new_admin);
    assert!(result.is_err());
}

#[test]
fn test_set_admin_rejects_calls_from_non_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // The attacker (not the current admin) attempts to call set_admin.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let result = client.try_set_admin(&new_admin);
    assert!(result.is_err());

    // Sanity check: original admin is still the same when properly authorised.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "admin",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
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
    );

    // Record USDC payment
    client.record_payment(
        &String::from_str(&env, "invoisio-usdc-001"),
        &payer,
        &usdc_code,
        &usdc_issuer,
        &50_000_000i128, // 5 USDC
    );

    // Record another token payment (e.g., EURT)
    client.record_payment(
        &String::from_str(&env, "invoisio-eurt-001"),
        &payer,
        &eurt_code,
        &eurt_issuer,
        &100_000_000i128, // 10 EURT
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
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Test that non-XLM asset without issuer is still rejected
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-no-issuer-2"),
        &payer,
        &String::from_str(&env, "BTC"),
        &String::from_str(&env, ""),
        &100_000_000i128,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidAsset)));

    // Test that XLM with issuer is rejected (issuer must be empty for XLM)
    let result = client.try_record_payment(
        &String::from_str(&env, "invoisio-xlm-with-issuer"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, "GABC123"),
        &10_000_000i128,
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
    let result = client.try_record_payment(&invoice_id, &payer, &code, &issuer, &100i128);
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow and succeed
    client.allow_asset(&code, &issuer);
    client.record_payment(&invoice_id, &payer, &code, &issuer, &100i128);
    assert!(client.has_payment(&invoice_id));

    // 3. Revoke and reject next one
    client.revoke_asset(&code, &issuer);
    let invoice_id_2 = String::from_str(&env, "inv-2");
    let result = client.try_record_payment(&invoice_id_2, &payer, &code, &issuer, &100i128);
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
    let result = client.try_record_payment(&invoice_id, &payer, &xlm, &empty, &100i128);
    assert_eq!(result, Err(Ok(ContractError::AssetNotAllowed)));

    // 2. Allow native and succeed
    client.set_allow_native(&true);
    client.record_payment(&invoice_id, &payer, &xlm, &empty, &100i128);
    assert!(client.has_payment(&invoice_id));

    // 3. Block native and reject next
    client.set_allow_native(&false);
    let invoice_id_2 = String::from_str(&env, "inv-native-2");
    let result = client.try_record_payment(&invoice_id_2, &payer, &xlm, &empty, &100i128);
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
            initialized: true,
            version: ContractMeta {
                contract_version: CONTRACT_VERSION,
                storage_schema_version: STORAGE_SCHEMA_VERSION,
            },
            allowlist_mode: AllowlistMode {
                native_allowed: true,
                requires_token_allowlist: true,
            },
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
    client.record_payment(&invoice_id, &payer, &code, &issuer, &50_000_000i128);
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
    };
    let record2 = PaymentRecord {
        invoice_id: invoice_ids.get(1).unwrap(),
        payer: payer2.clone(),
        asset: Asset::Native,
        amount: 20_000_000i128,
        timestamp: 2000u64,
    };
    let record3 = PaymentRecord {
        invoice_id: invoice_ids.get(2).unwrap(),
        payer: payer3.clone(),
        asset: Asset::Native,
        amount: 30_000_000i128,
        timestamp: 3000u64,
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
    let compatible = env.as_contract(&client.address, || {
        storage::is_schema_compatible(&env)
    });
    assert!(compatible);
    
    // Version info should match current
    let info = client.version_info();
    assert_eq!(info.storage_schema_version, STORAGE_SCHEMA_VERSION);
}
