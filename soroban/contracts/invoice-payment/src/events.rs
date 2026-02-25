use soroban_sdk::{contractevent, Env};
use crate::storage::PaymentRecord;

#[contractevent]
pub struct PaymentRecorded {
    pub record: PaymentRecord,
}

/// Emit a `("payment", "recorded")` Soroban event carrying the full
/// [`PaymentRecord`] as event data.
///
/// ## Why two topics?
/// The first topic (`"payment"`) identifies the domain; the second
/// (`"recorded"`) identifies the action. Off-chain consumers can filter
/// events using both topics simultaneously via the Soroban RPC
/// [`getEvents`](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
/// endpoint or the `stellar events` CLI.
///
/// ## Consuming events off-chain
/// ```sh
/// # Stream all "payment / recorded" events for CONTRACT_ID on testnet
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
