use crate::storage::PaymentRecord;
use soroban_sdk::{contractevent, Env};

#[contractevent]
pub struct PaymentRecorded {
    pub record: PaymentRecord,
}

/// Emit a `"payment_recorded"` Soroban event carrying the full
/// [`PaymentRecord`] as event data.
///
/// Off-chain consumers can filter by this topic via the Soroban RPC
/// [`getEvents`](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
/// endpoint or the `stellar events` CLI.
///
/// ## Consuming events off-chain
/// ```sh
/// # Stream all "payment_recorded" events for CONTRACT_ID on testnet
/// stellar events \
///   --id <CONTRACT_ID> \
///   --network testnet \
///   --type contract \
///   --start-ledger 1
/// ```
///
/// The event data is the XDR-encoded [`PaymentRecord`] struct, which the
/// Invoisio backend can deserialize using the generated contract bindings
/// (`stellar contract bindings typescript ...`).
///
/// ## Backend integration note
/// The backend can use this event stream as a **secondary** reconciliation
/// path alongside Horizon native-payment polling. Both paths are independent:
/// the backend may consume either or both without breaking existing invoices.
pub fn emit_payment_recorded(env: &Env, record: PaymentRecord) {
    PaymentRecorded { record }.publish(env);
}
