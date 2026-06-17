use soroban_sdk::{Env, String, Address, Symbol, Val};

pub fn emit_invoice_created(
    env: &Env,
    invoice_id: String,
    payer: Address,
    merchant: Address,
    total_amount: i128,
    asset_code: String,
    asset_issuer: Address,
) {
    let topics = (
        Symbol::new(env, "invoice"),
        Symbol::new(env, "created"),
    );
    let data = (
        invoice_id,
        payer,
        merchant,
        total_amount,
        asset_code,
        asset_issuer,
    );
    env.events().publish(topics, data);
}

pub fn emit_invoice_funded(
    env: &Env,
    invoice_id: String,
    amount: i128,
) {
    let topics = (
        Symbol::new(env, "invoice"),
        Symbol::new(env, "funded"),
    );
    let data = (invoice_id, amount);
    env.events().publish(topics, data);
}

pub fn emit_milestone_approved(
    env: &Env,
    invoice_id: String,
    milestone_id: u32,
    approved_by: Address,
) {
    let topics = (
        Symbol::new(env, "milestone"),
        Symbol::new(env, "approved"),
    );
    let data = (invoice_id, milestone_id, approved_by);
    env.events().publish(topics, data);
}

pub fn emit_milestone_released(
    env: &Env,
    invoice_id: String,
    milestone_id: u32,
    amount: i128,
    released_to: Address,
) {
    let topics = (
        Symbol::new(env, "milestone"),
        Symbol::new(env, "released"),
    );
    let data = (invoice_id, milestone_id, amount, released_to);
    env.events().publish(topics, data);
}

pub fn emit_invoice_completed(
    env: &Env,
    invoice_id: String,
) {
    let topics = (
        Symbol::new(env, "invoice"),
        Symbol::new(env, "completed"),
    );
    let data = (invoice_id,);
    env.events().publish(topics, data);
}

pub fn emit_invoice_cancelled(
    env: &Env,
    invoice_id: String,
    refunded_amount: i128,
    refunded_to: Address,
) {
    let topics = (
        Symbol::new(env, "invoice"),
        Symbol::new(env, "cancelled"),
    );
    let data = (invoice_id, refunded_amount, refunded_to);
    env.events().publish(topics, data);
}
