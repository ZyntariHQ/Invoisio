use soroban_sdk::contracterror;

/// Typed error codes for the Invoisio invoice-payment contract.
///
/// Using `#[contracterror]` means the Soroban host converts these into
/// `ScError::Contract(u32)` values on the ledger, which are:
/// - Surfaced as structured errors in Horizon `/operations` responses
/// - Inspectable via `stellar contract invoke --sim`
/// - Matchable in tests with `client.try_method()` → `Err(Ok(ContractError::*))`
///
/// **Never reorder or remove codes** once deployed — error codes are part of
/// the on-chain ABI. Only add new variants at the end.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize()` was called on a contract that is already set up.
    AlreadyInitialized = 1,

    /// A method that requires admin was called before `initialize()`.
    NotInitialized = 2,

    /// `record_payment()` was called with an `invoice_id` that was already
    /// recorded. Each invoice may be recorded exactly once.
    PaymentAlreadyRecorded = 3,

    /// `get_payment()` was called for an `invoice_id` that has no record.
    PaymentNotFound = 4,

    /// `amount` was zero or negative. All payments must be strictly positive.
    InvalidAmount = 5,

    /// `invoice_id` was an empty string. Every payment must reference a
    /// non-empty invoice identifier.
    InvalidInvoiceId = 6,

    /// `asset_code` was empty, or a non-XLM asset was supplied without an
    /// `asset_issuer`. Every payment must identify the asset unambiguously.
    InvalidAsset = 7,
}
