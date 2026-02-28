#![cfg(test)]
#![allow(clippy::all)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, String};

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

    client.record_payment(
        &invoice_id,
        &payer,
        &String::from_str(&env, "USDC"),
        &issuer,
        &50_000_000i128, // 5 USDC (7-decimal)
    );

    let record = client.get_payment(&invoice_id);
    assert_eq!(record.asset, Asset::Token(
        String::from_str(&env, "USDC"),
        issuer.clone(),
    ));
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
fn test_duplicate_invoice_id_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
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

#[test]
fn test_zero_amount_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let payer = Address::generate(&env);
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
    //
    // The expected PaymentRecord is constructed manually using the same values
    // passed to record_payment; timestamp is sourced from the ledger as-is (default test Env starts at 0).
    //
    // #[contractevent] on `PaymentRecorded { record: PaymentRecord }` generates:
    //   • topics : [Symbol("payment_recorded")]  — struct name in lower_snake_case
    //   • data   : Map { "record" => PaymentRecord }  — all fields keyed by name
    let expected_record = PaymentRecord {
        invoice_id: invoice_id.clone(),
        payer: payer.clone(),
        asset: Asset::Native,
        amount: 10_000_000i128,
        timestamp: env.ledger().timestamp(),
    };

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "payment_recorded").into_val(&env)
                ],
                soroban_sdk::map![
                    &env,
                    (Symbol::new(&env, "record"), expected_record)
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
// Multi-asset support tests

#[test]
fn test_asset_enum_native_xlm() {
    let env = Env::default();
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
    let issuer = String::from_str(&env, "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
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
    
    // Record XLM payment
    client.record_payment(
        &String::from_str(&env, "invoisio-xlm-001"),
        &payer,
        &String::from_str(&env, "XLM"),
        &String::from_str(&env, ""),
        &10_000_000i128, // 1 XLM
    );
    
    // Record USDC payment
    let usdc_issuer = String::from_str(
        &env,
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    client.record_payment(
        &String::from_str(&env, "invoisio-usdc-001"),
        &payer,
        &String::from_str(&env, "USDC"),
        &usdc_issuer,
        &50_000_000i128, // 5 USDC
    );
    
    // Record another token payment (e.g., EURT)
    let eurt_issuer = String::from_str(
        &env,
        "GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S",
    );
    client.record_payment(
        &String::from_str(&env, "invoisio-eurt-001"),
        &payer,
        &String::from_str(&env, "EURT"),
        &eurt_issuer,
        &100_000_000i128, // 10 EURT
    );
    
    // Verify all payments were recorded with correct asset types
    let xlm_record = client.get_payment(&String::from_str(&env, "invoisio-xlm-001"));
    assert_eq!(xlm_record.asset, Asset::Native);
    
    let usdc_record = client.get_payment(&String::from_str(&env, "invoisio-usdc-001"));
    assert_eq!(usdc_record.asset, Asset::Token(
        String::from_str(&env, "USDC"),
        usdc_issuer.clone(),
    ));
    
    let eurt_record = client.get_payment(&String::from_str(&env, "invoisio-eurt-001"));
    assert_eq!(eurt_record.asset, Asset::Token(
        String::from_str(&env, "EURT"),
        eurt_issuer.clone(),
    ));
    
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