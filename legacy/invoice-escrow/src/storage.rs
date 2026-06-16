use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::errors::ContractError;

// TTL constants
const MIN_TTL: u32 = 17_280; // ~1 day
const BUMP_TTL: u32 = 518_400; // ~30 days

// Versioning
pub const CONTRACT_VERSION: u32 = 1000000; // 1.0.0
pub const STORAGE_SCHEMA_VERSION: u32 = 1;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Milestone {
    pub id: u32,
    pub title: String,
    pub description: String,
    pub percentage: u32, // 1-100
    pub amount: i128,
    pub approved: bool,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum InvoiceStatus {
    Created,
    Funded,
    InProgress,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Invoice {
    pub invoice_id: String,
    pub payer: Address,
    pub merchant: Address,
    pub total_amount: i128,
    pub asset_code: String,
    pub asset_issuer: Address,
    pub milestones: Vec<Milestone>,
    pub status: InvoiceStatus,
    pub funded_amount: i128,
    pub released_amount: i128,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Invoice(String),
    ContractMeta,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractMeta {
    pub contract_version: u32,
    pub storage_schema_version: u32,
}

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

pub fn get_admin(env: &Env) -> Result<Address, ContractError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(ContractError::NotInitialized)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

pub fn has_invoice(env: &Env, invoice_id: &String) -> bool {
    env.storage().persistent().has(&DataKey::Invoice(invoice_id.clone()))
}

pub fn get_invoice(env: &Env, invoice_id: &String) -> Result<Invoice, ContractError> {
    let key = DataKey::Invoice(invoice_id.clone());
    let invoice = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(ContractError::InvoiceNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    Ok(invoice)
}

pub fn set_invoice(env: &Env, invoice: &Invoice) {
    let key = DataKey::Invoice(invoice.invoice_id.clone());
    env.storage().persistent().set(&key, invoice);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

pub fn get_contract_meta(env: &Env) -> Option<ContractMeta> {
    env.storage().instance().get(&DataKey::ContractMeta)
}

pub fn set_contract_meta(env: &Env, meta: &ContractMeta) {
    env.storage().instance().set(&DataKey::ContractMeta, meta);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

pub fn ensure_contract_meta(env: &Env) {
    let expected = ContractMeta {
        contract_version: CONTRACT_VERSION,
        storage_schema_version: STORAGE_SCHEMA_VERSION,
    };
    match get_contract_meta(env) {
        Some(meta) if meta == expected => {
            env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
        }
        _ => set_contract_meta(env, &expected),
    }
}
