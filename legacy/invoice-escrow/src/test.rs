#![cfg(test)]
#![allow(clippy::all)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, String, Vec,
};

fn setup(env: &Env) -> (InvoiceEscrowContractClient<'_>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(InvoiceEscrowContract, ());
    let client = InvoiceEscrowContractClient::new(env, &contract_id);
    client.initialize(&admin);
    (client, admin)
}

#[test]
fn test_initialize_sets_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    assert_eq!(client.get_admin(), admin);
}

#[test]
fn test_initialize_twice_fails() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let result = client.try_initialize(&admin);
    assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
}

#[test]
fn test_create_invoice() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-001");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut milestone_titles = Vec::new(&env);
    let mut milestone_descriptions = Vec::new(&env);
    let mut milestone_percentages = Vec::new(&env);

    milestone_titles.push_back(String::from_str(&env, "Design"));
    milestone_descriptions.push_back(String::from_str(&env, "UI/UX design"));
    milestone_percentages.push_back(30);

    milestone_titles.push_back(String::from_str(&env, "Development"));
    milestone_descriptions.push_back(String::from_str(&env, "Full stack dev"));
    milestone_percentages.push_back(50);

    milestone_titles.push_back(String::from_str(&env, "Delivery"));
    milestone_descriptions.push_back(String::from_str(&env, "Final delivery"));
    milestone_percentages.push_back(20);

    client.create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000, // 100 XLM in stroops
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &milestone_titles,
        &milestone_descriptions,
        &milestone_percentages,
    );

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.invoice_id, invoice_id);
    assert_eq!(invoice.payer, payer);
    assert_eq!(invoice.merchant, merchant);
    assert_eq!(invoice.total_amount, 100000000);
    assert_eq!(invoice.status, InvoiceStatus::Created);
    assert_eq!(invoice.milestones.len(), 3);
    assert_eq!(invoice.milestones.get(0).unwrap().percentage, 30);
    assert_eq!(invoice.milestones.get(0).unwrap().amount, 30000000);
}

#[test]
fn test_create_invoice_invalid_percentage_total_fails() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-002");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut milestone_titles = Vec::new(&env);
    let mut milestone_descriptions = Vec::new(&env);
    let mut milestone_percentages = Vec::new(&env);

    milestone_titles.push_back(String::from_str(&env, "Test"));
    milestone_descriptions.push_back(String::from_str(&env, "Test"));
    milestone_percentages.push_back(60);
    milestone_percentages.push_back(60); // Total 120, invalid

    let result = client.try_create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &milestone_titles,
        &milestone_descriptions,
        &milestone_percentages,
    );

    assert_eq!(result, Err(Ok(ContractError::MilestoneTotalExceeds100)));
}

#[test]
fn test_create_invoice_duplicate_fails() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-003");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut titles = Vec::new(&env);
    let mut descs = Vec::new(&env);
    let mut pcts = Vec::new(&env);
    titles.push_back(String::from_str(&env, "Test"));
    descs.push_back(String::from_str(&env, "Test"));
    pcts.push_back(100);

    client.create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &titles,
        &descs,
        &pcts,
    );

    let result = client.try_create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &titles,
        &descs,
        &pcts,
    );

    assert_eq!(result, Err(Ok(ContractError::InvoiceAlreadyExists)));
}

#[test]
fn test_fund_invoice() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-004");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut titles = Vec::new(&env);
    let mut descs = Vec::new(&env);
    let mut pcts = Vec::new(&env);
    titles.push_back(String::from_str(&env, "Test"));
    descs.push_back(String::from_str(&env, "Test"));
    pcts.push_back(100);

    client.create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &titles,
        &descs,
        &pcts,
    );

    env.mock_all_auths();
    client.fund_invoice(&invoice_id, &payer);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.status, InvoiceStatus::Funded);
    assert_eq!(invoice.funded_amount, 100000000);
}

#[test]
fn test_approve_and_release_milestone() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-005");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut titles = Vec::new(&env);
    let mut descs = Vec::new(&env);
    let mut pcts = Vec::new(&env);
    titles.push_back(String::from_str(&env, "Phase 1"));
    descs.push_back(String::from_str(&env, "First phase"));
    pcts.push_back(50);
    titles.push_back(String::from_str(&env, "Phase 2"));
    descs.push_back(String::from_str(&env, "Second phase"));
    pcts.push_back(50);

    client.create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &titles,
        &descs,
        &pcts,
    );

    env.mock_all_auths();
    client.fund_invoice(&invoice_id, &payer);
    client.approve_milestone(&invoice_id, &0, &payer);
    client.release_milestone(&invoice_id, &0);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.released_amount, 50000000);
    assert_eq!(invoice.milestones.get(0).unwrap().released, true);
    assert_eq!(invoice.status, InvoiceStatus::InProgress);

    client.approve_milestone(&invoice_id, &1, &payer);
    client.release_milestone(&invoice_id, &1);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.status, InvoiceStatus::Completed);
}

#[test]
fn test_cancel_invoice() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let invoice_id = String::from_str(&env, "inv-006");
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let asset_issuer = Address::generate(&env);

    let mut titles = Vec::new(&env);
    let mut descs = Vec::new(&env);
    let mut pcts = Vec::new(&env);
    titles.push_back(String::from_str(&env, "Test"));
    descs.push_back(String::from_str(&env, "Test"));
    pcts.push_back(100);

    client.create_invoice(
        &invoice_id,
        &payer,
        &merchant,
        &100000000,
        &String::from_str(&env, "XLM"),
        &asset_issuer,
        &titles,
        &descs,
        &pcts,
    );

    env.mock_all_auths();
    client.fund_invoice(&invoice_id, &payer);
    client.cancel_invoice(&invoice_id, &payer);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.status, InvoiceStatus::Cancelled);
}

#[test]
fn test_version_info() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let version = client.version_info();
    assert_eq!(version.contract_version, 1000000);
    assert_eq!(version.storage_schema_version, 1);
}
