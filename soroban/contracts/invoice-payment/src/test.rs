#![cfg(test)]
#![allow(clippy::all)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, String};

// TTL / Helpers

/// Deploy the contract and call `initialize`, returning the client and admin.
fn setup(env: &Env) -> (InvoicePaymentContractClient, Address) {
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
    assert_eq!(record.asset_code, String::from_str(&env, "XLM"));
    assert_eq!(record.asset_issuer, String::from_str(&env, ""));
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
    assert_eq!(record.asset_code, String::from_str(&env, "USDC"));
    assert_eq!(record.asset_issuer, issuer);
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
        },
    }]);

    // Without new_admin's auth the host must reject the call.
    let result = client.try_set_admin(&new_admin);
    assert!(result.is_err());
}
