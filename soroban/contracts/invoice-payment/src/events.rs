use soroban_sdk::{contractevent, Address, Env, String};

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct InvoicePaymentRecorded {
    pub invoice_id: String,
    pub payer: Address,
    pub asset_code: String,
    pub asset_issuer: String,
    pub amount: i128,
}

/// Emit an `"invoice_payment_recorded"` Soroban event carrying the flattened
/// `InvoicePaymentRecorded` as event data.
///
/// Off-chain consumers can filter by this topic via the Soroban RPC
/// [`getEvents`](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
/// endpoint or the `stellar events` CLI.
///
/// ## Consuming events off-chain
/// ```sh
/// # Stream all "invoice_payment_recorded" events for CONTRACT_ID on testnet
/// stellar events \
///   --id <CONTRACT_ID> \
///   --network testnet \
///   --type contract \
///   --start-ledger 1
/// ```
pub fn emit_payment_recorded(
    env: &Env,
    invoice_id: String,
    payer: Address,
    asset_code: String,
    asset_issuer: String,
    amount: i128,
) {
    let payload = InvoicePaymentRecorded {
        invoice_id,
        payer,
        asset_code,
        asset_issuer,
        amount,
    };

    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetAllowlisted {
    pub code: String,
    pub issuer: String,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetRevoked {
    pub code: String,
    pub issuer: String,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct NativeAllowChanged {
    pub allowed: bool,
}

pub fn emit_asset_allowlisted(env: &Env, code: String, issuer: String) {
    let payload = AssetAllowlisted { code, issuer };
    payload.publish(env);
}

pub fn emit_asset_revoked(env: &Env, code: String, issuer: String) {
    let payload = AssetRevoked { code, issuer };
    payload.publish(env);
}

pub fn emit_native_allow_changed(env: &Env, allowed: bool) {
    let payload = NativeAllowChanged { allowed };
    payload.publish(env);
}
