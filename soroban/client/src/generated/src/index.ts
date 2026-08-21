import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




/**
 * Typed error codes for the Invoisio invoice-payment contract.
 * 
 * Using `#[contracterror]` means the Soroban host converts these into
 * `ScError::Contract(u32)` values on the ledger, which are:
 * - Surfaced as structured errors in Horizon `/operations` responses
 * - Inspectable via `stellar contract invoke --sim`
 * - Matchable in tests with `client.try_method()` → `Err(Ok(ContractError::*))`
 * 
 * **Never reorder or remove codes** once deployed — error codes are part of
 * the on-chain ABI. Only add new variants at the end.
 */
export const ContractError = {
  /**
   * `initialize()` was called on a contract that is already set up.
   */
  1: {message:"AlreadyInitialized"},
  /**
   * A method that requires admin was called before `initialize()`.
   */
  2: {message:"NotInitialized"},
  /**
   * `record_payment()` was called with an `invoice_id` that was already
   * recorded. Each invoice may be recorded exactly once.
   */
  3: {message:"PaymentAlreadyRecorded"},
  /**
   * `get_payment()` was called for an `invoice_id` that has no record.
   */
  4: {message:"PaymentNotFound"},
  /**
   * `amount` was zero or negative. All payments must be strictly positive.
   */
  5: {message:"InvalidAmount"},
  /**
   * `invoice_id` was an empty string. Every payment must reference a
   * non-empty invoice identifier.
   */
  6: {message:"InvalidInvoiceId"},
  /**
   * `asset_code` was empty, or a non-XLM asset was supplied without an
   * `asset_issuer`. Every payment must identify the asset unambiguously.
   */
  7: {message:"InvalidAsset"},
  /**
   * The asset (code, issuer pair) is not in the admin-controlled allowlist.
   */
  8: {message:"AssetNotAllowed"},
  /**
   * The caller is not authorized to perform this operation.
   */
  9: {message:"Unauthorized"},
  /**
   * `upgrade_storage()` was called on a deployment whose on-chain
   * `storage_schema_version` is newer than this WASM knows about.
   */
  10: {message:"StorageSchemaTooNew"},
  /**
   * `upgrade_storage()` was called but the schema is already at or beyond
   * the version this WASM implements — nothing to do.
   */
  11: {message:"StorageSchemaTooOld"},
  /**
   * The contract is paused and cannot perform the requested operation.
   */
  12: {message:"ContractPaused"},
  /**
   * `settlement_ref` was empty or exceeded the maximum allowed length.
   */
  13: {message:"InvalidSettlementRef"},
  /**
   * `accept_admin()` was called but no admin transfer proposal is pending.
   */
  14: {message:"NoPendingAdmin"},
  /**
   * `propose_admin()` was called while an admin transfer proposal is
   * already pending. Only one handoff may be in flight at a time.
   */
  15: {message:"PendingAdminExists"},
  /**
   * `propose_admin()` was called with an invalid proposed admin — for
   * example, the current admin re-proposing themselves. A transfer must
   * hand the role to a different address.
   */
  16: {message:"InvalidProposedAdmin"}
}









/**
 * Asset type enum for multi-asset support.
 * 
 * This enum distinguishes between native XLM and Stellar-issued tokens,
 * providing a type-safe way to handle different asset types in the contract.
 */
export type Asset = {tag: "Native", values: void} | {tag: "Token", values: readonly [string, string]};

/**
 * All keys used in this contract's instance and persistent storage.
 * 
 * `#[contracttype]` encodes each variant as an XDR `ScVal`, which Soroban
 * uses as the raw storage key on the ledger.
 */
export type DataKey = {tag: "Admin", values: void} | {tag: "PaymentCount", values: void} | {tag: "PaymentHistoryCount", values: void} | {tag: "ContractMeta", values: void} | {tag: "Payment", values: readonly [string]} | {tag: "PaymentV1", values: readonly [string]} | {tag: "PaymentHistory", values: readonly [u32]} | {tag: "AllowList", values: readonly [string, string]} | {tag: "AllowNative", values: void} | {tag: "Paused", values: void} | {tag: "PendingAdmin", values: void};


export interface ContractMeta {
  /**
 * Contract code version that most recently wrote state.
 */
contract_version: u32;
  /**
 * Storage layout/schema version in this contract instance.
 */
storage_schema_version: u32;
}


/**
 * Stable, high-level summary of allowlist policy for integration consumers.
 * 
 * `requires_token_allowlist` is currently always `true`: issued assets must be
 * explicitly added via `allow_asset(code, issuer)` before `record_payment`
 * accepts them. `native_allowed` reflects the mutable XLM toggle controlled by
 * `set_allow_native`.
 */
export interface AllowlistMode {
  native_allowed: boolean;
  requires_token_allowlist: boolean;
}


/**
 * On-chain snapshot of a single invoice payment.
 * 
 * ## Asset encoding
 * Uses the [`Asset`] enum to provide type-safe multi-asset support.
 * 
 * ## Amount units
 * - **XLM**: stroops — 1 XLM = 10 000 000 stroops.
 * - **Other tokens**: the token's own smallest unit
 * (USDC on Stellar uses 7 decimal places).
 */
export interface PaymentRecord {
  /**
 * Payment amount in the asset's smallest unit (must be > 0).
 */
amount: i128;
  /**
 * Asset type and details.
 */
asset: Asset;
  /**
 * Unique invoice identifier.
 * 
 * Matches the native Stellar Payment memo used by Invoisio:
 * `"invoisio-<invoiceId>"`.
 */
invoice_id: string;
  /**
 * Stellar account address that sent the payment.
 */
payer: string;
  /**
 * Normalised settlement reference for backend deduplication and auditing.
 * 
 * A deterministic hash or reference ID (e.g. a SHA-256 hex string or
 * a well-known reconciliation identifier) that the backend uses for
 * idempotent settlement reconciliation. Stored on-chain so any observer
 * can verify the settlement reference associated with a payment.
 */
settlement_ref: string;
  /**
 * Unix timestamp (seconds) sourced from the ledger at recording time.
 */
timestamp: u64;
}


/**
 * Stable read model for ops tooling and client integrations.
 * 
 * Returned by the contract `config()` view so consumers can inspect
 * initialization status, admin ownership, version metadata, and allowlist
 * policy in a single permissionless call.
 */
export interface ContractConfig {
  /**
 * `Some(admin)` once `initialize(admin)` has been called; `None` before.
 */
admin: Option<string>;
  /**
 * High-level asset policy snapshot for native XLM and issued tokens.
 */
allowlist_mode: AllowlistMode;
  /**
 * Whether the contract has been initialised and can accept admin-gated writes.
 */
initialized: boolean;
  /**
 * Whether the contract is currently paused (writes disabled).
 */
paused: boolean;
  /**
 * The address awaiting acceptance via `accept_admin()`, if `propose_admin()`
 * was called. `None` when no transfer is in flight.
 */
pending_admin: Option<string>;
  /**
 * On-chain version metadata associated with the current stored state.
 */
version: ContractMeta;
}


/**
 * A bounded, cursor-friendly slice of payment history.
 */
export interface PaymentHistoryPage {
  /**
 * True when more entries are available after `next_cursor`.
 */
has_more: boolean;
  /**
 * Cursor to pass to the next call.
 */
next_cursor: u32;
  /**
 * Records returned for this page.
 */
records: Array<PaymentRecord>;
}

export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current admin address.
   * 
   * Returns [`ContractError::NotInitialized`] if the contract has not been
   * initialised yet.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return a high-level snapshot of contract state for ops tooling.
   * 
   * Permissionless — any account can call this to inspect initialization
   * status, admin address, version metadata, and allowlist policy.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<ContractConfig>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return `true` if the contract is currently paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialise the contract and register the `admin`.
   * 
   * Must be called **once** right after deployment. The `admin` is the only
   * account permitted to call [`record_payment`], [`propose_admin`] and the
   * other admin-gated write methods.
   * 
   * Returns [`ContractError::AlreadyInitialized`] if called a second time.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause or unpause the contract.
   * 
   * When paused, all write operations (`record_payment`) are rejected.
   * Read operations remain accessible.
   * 
   * ## Authorization
   * Only the contract admin can call this method.
   * 
   * ## Events
   * Emits `ContractPaused` event with the new state.
   * 
   * ## Errors
   * - `NotInitialized` if contract not initialized
   * - `Unauthorized` if caller is not admin
   */
  set_paused: ({caller, paused}: {caller: string, paused: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a allow_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add a `(code, issuer)` token pair to the allowlist.
   * 
   * The **contract admin** must authorise this call.
   */
  allow_asset: ({code, issuer}: {code: string, issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_payment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the [`PaymentRecord`] for `invoice_id`.
   * 
   * Returns [`ContractError::InvalidInvoiceId`] if `invoice_id` is empty.
   * Returns [`ContractError::PaymentNotFound`] if nothing has been recorded.
   * Use [`has_payment`] first if existence is uncertain.
   */
  get_payment: ({invoice_id}: {invoice_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<PaymentRecord>>>

  /**
   * Construct and simulate a has_payment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return `true` if a payment has been recorded for `invoice_id`.
   * 
   * Returns `false` if `invoice_id` is empty (invalid input) or if no record exists.
   */
  has_payment: ({invoice_id}: {invoice_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accept a pending admin transfer and become the contract admin (step 2
   * of the two-step handoff).
   * 
   * `caller` must be the address that was proposed by [`propose_admin`] and
   * must authorise the call. On success the role is transferred and the
   * pending proposal is cleared.
   * 
   * ## Errors
   * - [`ContractError::NotInitialized`] — contract was never initialised
   * - [`ContractError::NoPendingAdmin`] — no proposal is pending
   * - [`ContractError::Unauthorized`] — `caller` is not the proposed admin
   * 
   * ## Events
   * Emits `AdminTransferAccepted` on success.
   */
  accept_admin: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove a `(code, issuer)` token pair from the allowlist.
   * 
   * The **contract admin** must authorise this call.
   */
  revoke_asset: ({code, issuer}: {code: string, issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version_info transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the currently detected on-chain state metadata.
   * 
   * Legacy deployments created before explicit metadata support return `0`
   * for both fields until a write-path call backfills metadata.
   */
  version_info: (options?: MethodOptions) => Promise<AssembledTransaction<ContractMeta>>

  /**
   * Construct and simulate a payment_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the total number of payments recorded in this contract instance.
   */
  payment_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the address currently proposed as the next admin, if any.
   * 
   * Permissionless read. Returns `None` when no [`propose_admin`] transfer
   * is in flight (either none was ever made or it was accepted/cleared).
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose `new_admin` as the next contract admin (step 1 of the two-step
   * handoff).
   * 
   * Only the **current admin** may authorise this call. The proposal is
   * staged in instance storage but does **not** take effect until the
   * proposed address calls [`accept_admin`].
   * 
   * ## Errors
   * - [`ContractError::NotInitialized`] — contract was never initialised
   * - [`ContractError::PendingAdminExists`] — a transfer is already pending
   * - [`ContractError::InvalidProposedAdmin`] — `new_admin` equals the
   * current admin
   * 
   * ## Events
   * Emits `AdminTransferProposed` on success.
   */
  propose_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a record_payment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record a payment for `invoice_id` on-chain and emit a Soroban event.
   * 
   * ## Authorization
   * The **contract admin** must authorise this call. In the Invoisio flow
   * the admin is the backend service account that has already verified the
   * companion native Stellar Payment on Horizon before calling this method.
   * 
   * ## Idempotency
   * Each `invoice_id` may be recorded **only once**.
   * Returns [`ContractError::PaymentAlreadyRecorded`] on duplicates.
   * 
   * ## Emitted event
   * | Field  | Value                                   |
   * |--------|-----------------------------------------|
   * | Topics | `(Symbol "invoice", Symbol "payment")`  |
   * | Data   | [`InvoicePaymentRecordedEvent`] struct  |
   * 
   * Subscribe via:
   * ```sh
   * stellar events --id <CONTRACT_ID> --type contract --start-ledger 1
   * ```
   * 
   * ## Parameters
   * - `invoice_id`      — unique invoice identifier (e.g. `"invoisio-abc123"`)
   * - `payer`           — Stellar account address that sent the payment
   * - `asset_code`      — `"XLM"` or token code (e.g. `"USDC"`)
   * - `asset_issuer`    — issuer public key for t
   */
  record_payment: ({invoice_id, payer, asset_code, asset_issuer, amount, settlement_ref}: {invoice_id: string, payer: string, asset_code: string, asset_issuer: string, amount: i128, settlement_ref: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a payment_history transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return a paginated slice of payment history.
   * 
   * - `cursor` — zero-based index to start from (pass `0` for the first page).
   * - `limit` — maximum records to return (capped internally at 25).
   * 
   * Permissionless read — no auth required.
   */
  payment_history: ({cursor, limit}: {cursor: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<PaymentHistoryPage>>

  /**
   * Construct and simulate a upgrade_storage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Migrate on-chain storage layout to the current schema version.
   * 
   * Must be called by the admin after a WASM upgrade that introduces a new
   * `STORAGE_SCHEMA_VERSION`. Safe to call multiple times — idempotent.
   */
  upgrade_storage: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a contract_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current **code** version as packed semver
   * (`MAJOR * 1_000_000 + MINOR * 1_000 + PATCH`).
   */
  contract_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_allow_native transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Toggle whether native XLM payments are permitted.
   * 
   * The **contract admin** must authorise this call.
   */
  set_allow_native: ({allowed}: {allowed: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a payments_by_payer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return all payments made by `payer`, paginated.
   * 
   * Scans the deterministic history index and filters by payer address.
   * - `cursor` — history index to start scanning from.
   * - `limit` — maximum records to return (capped at 25).
   * 
   * Permissionless read — no auth required.
   */
  payments_by_payer: ({payer, cursor, limit}: {payer: string, cursor: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<PaymentHistoryPage>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAHpSZXR1cm4gdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcy4KClJldHVybnMgW2BDb250cmFjdEVycm9yOjpOb3RJbml0aWFsaXplZGBdIGlmIHRoZSBjb250cmFjdCBoYXMgbm90IGJlZW4KaW5pdGlhbGlzZWQgeWV0LgAAAAAABWFkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAMZSZXR1cm4gYSBoaWdoLWxldmVsIHNuYXBzaG90IG9mIGNvbnRyYWN0IHN0YXRlIGZvciBvcHMgdG9vbGluZy4KClBlcm1pc3Npb25sZXNzIOKAlCBhbnkgYWNjb3VudCBjYW4gY2FsbCB0aGlzIHRvIGluc3BlY3QgaW5pdGlhbGl6YXRpb24Kc3RhdHVzLCBhZG1pbiBhZGRyZXNzLCB2ZXJzaW9uIG1ldGFkYXRhLCBhbmQgYWxsb3dsaXN0IHBvbGljeS4AAAAAAAZjb25maWcAAAAAAAAAAAABAAAH0AAAAA5Db250cmFjdENvbmZpZwAA",
        "AAAAAAAAADJSZXR1cm4gYHRydWVgIGlmIHRoZSBjb250cmFjdCBpcyBjdXJyZW50bHkgcGF1c2VkLgAAAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAStJbml0aWFsaXNlIHRoZSBjb250cmFjdCBhbmQgcmVnaXN0ZXIgdGhlIGBhZG1pbmAuCgpNdXN0IGJlIGNhbGxlZCAqKm9uY2UqKiByaWdodCBhZnRlciBkZXBsb3ltZW50LiBUaGUgYGFkbWluYCBpcyB0aGUgb25seQphY2NvdW50IHBlcm1pdHRlZCB0byBjYWxsIFtgcmVjb3JkX3BheW1lbnRgXSwgW2Bwcm9wb3NlX2FkbWluYF0gYW5kIHRoZQpvdGhlciBhZG1pbi1nYXRlZCB3cml0ZSBtZXRob2RzLgoKUmV0dXJucyBbYENvbnRyYWN0RXJyb3I6OkFscmVhZHlJbml0aWFsaXplZGBdIGlmIGNhbGxlZCBhIHNlY29uZCB0aW1lLgAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAWNQYXVzZSBvciB1bnBhdXNlIHRoZSBjb250cmFjdC4KCldoZW4gcGF1c2VkLCBhbGwgd3JpdGUgb3BlcmF0aW9ucyAoYHJlY29yZF9wYXltZW50YCkgYXJlIHJlamVjdGVkLgpSZWFkIG9wZXJhdGlvbnMgcmVtYWluIGFjY2Vzc2libGUuCgojIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGNvbnRyYWN0IGFkbWluIGNhbiBjYWxsIHRoaXMgbWV0aG9kLgoKIyMgRXZlbnRzCkVtaXRzIGBDb250cmFjdFBhdXNlZGAgZXZlbnQgd2l0aCB0aGUgbmV3IHN0YXRlLgoKIyMgRXJyb3JzCi0gYE5vdEluaXRpYWxpemVkYCBpZiBjb250cmFjdCBub3QgaW5pdGlhbGl6ZWQKLSBgVW5hdXRob3JpemVkYCBpZiBjYWxsZXIgaXMgbm90IGFkbWluAAAAAApzZXRfcGF1c2VkAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABnBhdXNlZAAAAAAAAQAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAGVBZGQgYSBgKGNvZGUsIGlzc3VlcilgIHRva2VuIHBhaXIgdG8gdGhlIGFsbG93bGlzdC4KClRoZSAqKmNvbnRyYWN0IGFkbWluKiogbXVzdCBhdXRob3Jpc2UgdGhpcyBjYWxsLgAAAAAAAAthbGxvd19hc3NldAAAAAACAAAAAAAAAARjb2RlAAAAEAAAAAAAAAAGaXNzdWVyAAAAAAAQAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAPNSZXR1cm4gdGhlIFtgUGF5bWVudFJlY29yZGBdIGZvciBgaW52b2ljZV9pZGAuCgpSZXR1cm5zIFtgQ29udHJhY3RFcnJvcjo6SW52YWxpZEludm9pY2VJZGBdIGlmIGBpbnZvaWNlX2lkYCBpcyBlbXB0eS4KUmV0dXJucyBbYENvbnRyYWN0RXJyb3I6OlBheW1lbnROb3RGb3VuZGBdIGlmIG5vdGhpbmcgaGFzIGJlZW4gcmVjb3JkZWQuClVzZSBbYGhhc19wYXltZW50YF0gZmlyc3QgaWYgZXhpc3RlbmNlIGlzIHVuY2VydGFpbi4AAAAAC2dldF9wYXltZW50AAAAAAEAAAAAAAAACmludm9pY2VfaWQAAAAAABAAAAABAAAD6QAAB9AAAAANUGF5bWVudFJlY29yZAAAAAAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAJBSZXR1cm4gYHRydWVgIGlmIGEgcGF5bWVudCBoYXMgYmVlbiByZWNvcmRlZCBmb3IgYGludm9pY2VfaWRgLgoKUmV0dXJucyBgZmFsc2VgIGlmIGBpbnZvaWNlX2lkYCBpcyBlbXB0eSAoaW52YWxpZCBpbnB1dCkgb3IgaWYgbm8gcmVjb3JkIGV4aXN0cy4AAAALaGFzX3BheW1lbnQAAAAAAQAAAAAAAAAKaW52b2ljZV9pZAAAAAAAEAAAAAEAAAAB",
        "AAAAAAAAAhhBY2NlcHQgYSBwZW5kaW5nIGFkbWluIHRyYW5zZmVyIGFuZCBiZWNvbWUgdGhlIGNvbnRyYWN0IGFkbWluIChzdGVwIDIKb2YgdGhlIHR3by1zdGVwIGhhbmRvZmYpLgoKYGNhbGxlcmAgbXVzdCBiZSB0aGUgYWRkcmVzcyB0aGF0IHdhcyBwcm9wb3NlZCBieSBbYHByb3Bvc2VfYWRtaW5gXSBhbmQKbXVzdCBhdXRob3Jpc2UgdGhlIGNhbGwuIE9uIHN1Y2Nlc3MgdGhlIHJvbGUgaXMgdHJhbnNmZXJyZWQgYW5kIHRoZQpwZW5kaW5nIHByb3Bvc2FsIGlzIGNsZWFyZWQuCgojIyBFcnJvcnMKLSBbYENvbnRyYWN0RXJyb3I6Ok5vdEluaXRpYWxpemVkYF0g4oCUIGNvbnRyYWN0IHdhcyBuZXZlciBpbml0aWFsaXNlZAotIFtgQ29udHJhY3RFcnJvcjo6Tm9QZW5kaW5nQWRtaW5gXSDigJQgbm8gcHJvcG9zYWwgaXMgcGVuZGluZwotIFtgQ29udHJhY3RFcnJvcjo6VW5hdXRob3JpemVkYF0g4oCUIGBjYWxsZXJgIGlzIG5vdCB0aGUgcHJvcG9zZWQgYWRtaW4KCiMjIEV2ZW50cwpFbWl0cyBgQWRtaW5UcmFuc2ZlckFjY2VwdGVkYCBvbiBzdWNjZXNzLgAAAAxhY2NlcHRfYWRtaW4AAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAGpSZW1vdmUgYSBgKGNvZGUsIGlzc3VlcilgIHRva2VuIHBhaXIgZnJvbSB0aGUgYWxsb3dsaXN0LgoKVGhlICoqY29udHJhY3QgYWRtaW4qKiBtdXN0IGF1dGhvcmlzZSB0aGlzIGNhbGwuAAAAAAAMcmV2b2tlX2Fzc2V0AAAAAgAAAAAAAAAEY29kZQAAABAAAAAAAAAABmlzc3VlcgAAAAAAEAAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAALpSZXR1cm4gdGhlIGN1cnJlbnRseSBkZXRlY3RlZCBvbi1jaGFpbiBzdGF0ZSBtZXRhZGF0YS4KCkxlZ2FjeSBkZXBsb3ltZW50cyBjcmVhdGVkIGJlZm9yZSBleHBsaWNpdCBtZXRhZGF0YSBzdXBwb3J0IHJldHVybiBgMGAKZm9yIGJvdGggZmllbGRzIHVudGlsIGEgd3JpdGUtcGF0aCBjYWxsIGJhY2tmaWxscyBtZXRhZGF0YS4AAAAAAAx2ZXJzaW9uX2luZm8AAAAAAAAAAQAAB9AAAAAMQ29udHJhY3RNZXRh",
        "AAAAAAAAAEdSZXR1cm4gdGhlIHRvdGFsIG51bWJlciBvZiBwYXltZW50cyByZWNvcmRlZCBpbiB0aGlzIGNvbnRyYWN0IGluc3RhbmNlLgAAAAANcGF5bWVudF9jb3VudAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAM1SZXR1cm4gdGhlIGFkZHJlc3MgY3VycmVudGx5IHByb3Bvc2VkIGFzIHRoZSBuZXh0IGFkbWluLCBpZiBhbnkuCgpQZXJtaXNzaW9ubGVzcyByZWFkLiBSZXR1cm5zIGBOb25lYCB3aGVuIG5vIFtgcHJvcG9zZV9hZG1pbmBdIHRyYW5zZmVyCmlzIGluIGZsaWdodCAoZWl0aGVyIG5vbmUgd2FzIGV2ZXIgbWFkZSBvciBpdCB3YXMgYWNjZXB0ZWQvY2xlYXJlZCkuAAAAAAAADXBlbmRpbmdfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAiRQcm9wb3NlIGBuZXdfYWRtaW5gIGFzIHRoZSBuZXh0IGNvbnRyYWN0IGFkbWluIChzdGVwIDEgb2YgdGhlIHR3by1zdGVwCmhhbmRvZmYpLgoKT25seSB0aGUgKipjdXJyZW50IGFkbWluKiogbWF5IGF1dGhvcmlzZSB0aGlzIGNhbGwuIFRoZSBwcm9wb3NhbCBpcwpzdGFnZWQgaW4gaW5zdGFuY2Ugc3RvcmFnZSBidXQgZG9lcyAqKm5vdCoqIHRha2UgZWZmZWN0IHVudGlsIHRoZQpwcm9wb3NlZCBhZGRyZXNzIGNhbGxzIFtgYWNjZXB0X2FkbWluYF0uCgojIyBFcnJvcnMKLSBbYENvbnRyYWN0RXJyb3I6Ok5vdEluaXRpYWxpemVkYF0g4oCUIGNvbnRyYWN0IHdhcyBuZXZlciBpbml0aWFsaXNlZAotIFtgQ29udHJhY3RFcnJvcjo6UGVuZGluZ0FkbWluRXhpc3RzYF0g4oCUIGEgdHJhbnNmZXIgaXMgYWxyZWFkeSBwZW5kaW5nCi0gW2BDb250cmFjdEVycm9yOjpJbnZhbGlkUHJvcG9zZWRBZG1pbmBdIOKAlCBgbmV3X2FkbWluYCBlcXVhbHMgdGhlCmN1cnJlbnQgYWRtaW4KCiMjIEV2ZW50cwpFbWl0cyBgQWRtaW5UcmFuc2ZlclByb3Bvc2VkYCBvbiBzdWNjZXNzLgAAAA1wcm9wb3NlX2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAABABSZWNvcmQgYSBwYXltZW50IGZvciBgaW52b2ljZV9pZGAgb24tY2hhaW4gYW5kIGVtaXQgYSBTb3JvYmFuIGV2ZW50LgoKIyMgQXV0aG9yaXphdGlvbgpUaGUgKipjb250cmFjdCBhZG1pbioqIG11c3QgYXV0aG9yaXNlIHRoaXMgY2FsbC4gSW4gdGhlIEludm9pc2lvIGZsb3cKdGhlIGFkbWluIGlzIHRoZSBiYWNrZW5kIHNlcnZpY2UgYWNjb3VudCB0aGF0IGhhcyBhbHJlYWR5IHZlcmlmaWVkIHRoZQpjb21wYW5pb24gbmF0aXZlIFN0ZWxsYXIgUGF5bWVudCBvbiBIb3Jpem9uIGJlZm9yZSBjYWxsaW5nIHRoaXMgbWV0aG9kLgoKIyMgSWRlbXBvdGVuY3kKRWFjaCBgaW52b2ljZV9pZGAgbWF5IGJlIHJlY29yZGVkICoqb25seSBvbmNlKiouClJldHVybnMgW2BDb250cmFjdEVycm9yOjpQYXltZW50QWxyZWFkeVJlY29yZGVkYF0gb24gZHVwbGljYXRlcy4KCiMjIEVtaXR0ZWQgZXZlbnQKfCBGaWVsZCAgfCBWYWx1ZSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfAp8LS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18CnwgVG9waWNzIHwgYChTeW1ib2wgImludm9pY2UiLCBTeW1ib2wgInBheW1lbnQiKWAgIHwKfCBEYXRhICAgfCBbYEludm9pY2VQYXltZW50UmVjb3JkZWRFdmVudGBdIHN0cnVjdCAgfAoKU3Vic2NyaWJlIHZpYToKYGBgc2gKc3RlbGxhciBldmVudHMgLS1pZCA8Q09OVFJBQ1RfSUQ+IC0tdHlwZSBjb250cmFjdCAtLXN0YXJ0LWxlZGdlciAxCmBgYAoKIyMgUGFyYW1ldGVycwotIGBpbnZvaWNlX2lkYCAgICAgIOKAlCB1bmlxdWUgaW52b2ljZSBpZGVudGlmaWVyIChlLmcuIGAiaW52b2lzaW8tYWJjMTIzImApCi0gYHBheWVyYCAgICAgICAgICAg4oCUIFN0ZWxsYXIgYWNjb3VudCBhZGRyZXNzIHRoYXQgc2VudCB0aGUgcGF5bWVudAotIGBhc3NldF9jb2RlYCAgICAgIOKAlCBgIlhMTSJgIG9yIHRva2VuIGNvZGUgKGUuZy4gYCJVU0RDImApCi0gYGFzc2V0X2lzc3VlcmAgICAg4oCUIGlzc3VlciBwdWJsaWMga2V5IGZvciB0AAAADnJlY29yZF9wYXltZW50AAAAAAAGAAAAAAAAAAppbnZvaWNlX2lkAAAAAAAQAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAACmFzc2V0X2NvZGUAAAAAABAAAAAAAAAADGFzc2V0X2lzc3VlcgAAABAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAOc2V0dGxlbWVudF9yZWYAAAAAABAAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAOhSZXR1cm4gYSBwYWdpbmF0ZWQgc2xpY2Ugb2YgcGF5bWVudCBoaXN0b3J5LgoKLSBgY3Vyc29yYCDigJQgemVyby1iYXNlZCBpbmRleCB0byBzdGFydCBmcm9tIChwYXNzIGAwYCBmb3IgdGhlIGZpcnN0IHBhZ2UpLgotIGBsaW1pdGAg4oCUIG1heGltdW0gcmVjb3JkcyB0byByZXR1cm4gKGNhcHBlZCBpbnRlcm5hbGx5IGF0IDI1KS4KClBlcm1pc3Npb25sZXNzIHJlYWQg4oCUIG5vIGF1dGggcmVxdWlyZWQuAAAAD3BheW1lbnRfaGlzdG9yeQAAAAACAAAAAAAAAAZjdXJzb3IAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAfQAAAAElBheW1lbnRIaXN0b3J5UGFnZQAA",
        "AAAAAAAAAMxNaWdyYXRlIG9uLWNoYWluIHN0b3JhZ2UgbGF5b3V0IHRvIHRoZSBjdXJyZW50IHNjaGVtYSB2ZXJzaW9uLgoKTXVzdCBiZSBjYWxsZWQgYnkgdGhlIGFkbWluIGFmdGVyIGEgV0FTTSB1cGdyYWRlIHRoYXQgaW50cm9kdWNlcyBhIG5ldwpgU1RPUkFHRV9TQ0hFTUFfVkVSU0lPTmAuIFNhZmUgdG8gY2FsbCBtdWx0aXBsZSB0aW1lcyDigJQgaWRlbXBvdGVudC4AAAAPdXBncmFkZV9zdG9yYWdlAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAGNSZXR1cm4gdGhlIGN1cnJlbnQgKipjb2RlKiogdmVyc2lvbiBhcyBwYWNrZWQgc2VtdmVyCihgTUFKT1IgKiAxXzAwMF8wMDAgKyBNSU5PUiAqIDFfMDAwICsgUEFUQ0hgKS4AAAAAEGNvbnRyYWN0X3ZlcnNpb24AAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAGNUb2dnbGUgd2hldGhlciBuYXRpdmUgWExNIHBheW1lbnRzIGFyZSBwZXJtaXR0ZWQuCgpUaGUgKipjb250cmFjdCBhZG1pbioqIG11c3QgYXV0aG9yaXNlIHRoaXMgY2FsbC4AAAAAEHNldF9hbGxvd19uYXRpdmUAAAABAAAAAAAAAAdhbGxvd2VkAAAAAAEAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAQxSZXR1cm4gYWxsIHBheW1lbnRzIG1hZGUgYnkgYHBheWVyYCwgcGFnaW5hdGVkLgoKU2NhbnMgdGhlIGRldGVybWluaXN0aWMgaGlzdG9yeSBpbmRleCBhbmQgZmlsdGVycyBieSBwYXllciBhZGRyZXNzLgotIGBjdXJzb3JgIOKAlCBoaXN0b3J5IGluZGV4IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb20uCi0gYGxpbWl0YCDigJQgbWF4aW11bSByZWNvcmRzIHRvIHJldHVybiAoY2FwcGVkIGF0IDI1KS4KClBlcm1pc3Npb25sZXNzIHJlYWQg4oCUIG5vIGF1dGggcmVxdWlyZWQuAAAAEXBheW1lbnRzX2J5X3BheWVyAAAAAAAAAwAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAZjdXJzb3IAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAfQAAAAElBheW1lbnRIaXN0b3J5UGFnZQAA",
        "AAAABAAAAgFUeXBlZCBlcnJvciBjb2RlcyBmb3IgdGhlIEludm9pc2lvIGludm9pY2UtcGF5bWVudCBjb250cmFjdC4KClVzaW5nIGAjW2NvbnRyYWN0ZXJyb3JdYCBtZWFucyB0aGUgU29yb2JhbiBob3N0IGNvbnZlcnRzIHRoZXNlIGludG8KYFNjRXJyb3I6OkNvbnRyYWN0KHUzMilgIHZhbHVlcyBvbiB0aGUgbGVkZ2VyLCB3aGljaCBhcmU6Ci0gU3VyZmFjZWQgYXMgc3RydWN0dXJlZCBlcnJvcnMgaW4gSG9yaXpvbiBgL29wZXJhdGlvbnNgIHJlc3BvbnNlcwotIEluc3BlY3RhYmxlIHZpYSBgc3RlbGxhciBjb250cmFjdCBpbnZva2UgLS1zaW1gCi0gTWF0Y2hhYmxlIGluIHRlc3RzIHdpdGggYGNsaWVudC50cnlfbWV0aG9kKClgIOKGkiBgRXJyKE9rKENvbnRyYWN0RXJyb3I6OiopKWAKCioqTmV2ZXIgcmVvcmRlciBvciByZW1vdmUgY29kZXMqKiBvbmNlIGRlcGxveWVkIOKAlCBlcnJvciBjb2RlcyBhcmUgcGFydCBvZgp0aGUgb24tY2hhaW4gQUJJLiBPbmx5IGFkZCBuZXcgdmFyaWFudHMgYXQgdGhlIGVuZC4AAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAQAAAAP2Bpbml0aWFsaXplKClgIHdhcyBjYWxsZWQgb24gYSBjb250cmFjdCB0aGF0IGlzIGFscmVhZHkgc2V0IHVwLgAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAPkEgbWV0aG9kIHRoYXQgcmVxdWlyZXMgYWRtaW4gd2FzIGNhbGxlZCBiZWZvcmUgYGluaXRpYWxpemUoKWAuAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAB4YHJlY29yZF9wYXltZW50KClgIHdhcyBjYWxsZWQgd2l0aCBhbiBgaW52b2ljZV9pZGAgdGhhdCB3YXMgYWxyZWFkeQpyZWNvcmRlZC4gRWFjaCBpbnZvaWNlIG1heSBiZSByZWNvcmRlZCBleGFjdGx5IG9uY2UuAAAAFlBheW1lbnRBbHJlYWR5UmVjb3JkZWQAAAAAAAMAAABCYGdldF9wYXltZW50KClgIHdhcyBjYWxsZWQgZm9yIGFuIGBpbnZvaWNlX2lkYCB0aGF0IGhhcyBubyByZWNvcmQuAAAAAAAPUGF5bWVudE5vdEZvdW5kAAAAAAQAAABGYGFtb3VudGAgd2FzIHplcm8gb3IgbmVnYXRpdmUuIEFsbCBwYXltZW50cyBtdXN0IGJlIHN0cmljdGx5IHBvc2l0aXZlLgAAAAAADUludmFsaWRBbW91bnQAAAAAAAAFAAAAXmBpbnZvaWNlX2lkYCB3YXMgYW4gZW1wdHkgc3RyaW5nLiBFdmVyeSBwYXltZW50IG11c3QgcmVmZXJlbmNlIGEKbm9uLWVtcHR5IGludm9pY2UgaWRlbnRpZmllci4AAAAAABBJbnZhbGlkSW52b2ljZUlkAAAABgAAAIdgYXNzZXRfY29kZWAgd2FzIGVtcHR5LCBvciBhIG5vbi1YTE0gYXNzZXQgd2FzIHN1cHBsaWVkIHdpdGhvdXQgYW4KYGFzc2V0X2lzc3VlcmAuIEV2ZXJ5IHBheW1lbnQgbXVzdCBpZGVudGlmeSB0aGUgYXNzZXQgdW5hbWJpZ3VvdXNseS4AAAAADEludmFsaWRBc3NldAAAAAcAAABHVGhlIGFzc2V0IChjb2RlLCBpc3N1ZXIgcGFpcikgaXMgbm90IGluIHRoZSBhZG1pbi1jb250cm9sbGVkIGFsbG93bGlzdC4AAAAAD0Fzc2V0Tm90QWxsb3dlZAAAAAAIAAAAN1RoZSBjYWxsZXIgaXMgbm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIG9wZXJhdGlvbi4AAAAADFVuYXV0aG9yaXplZAAAAAkAAAB7YHVwZ3JhZGVfc3RvcmFnZSgpYCB3YXMgY2FsbGVkIG9uIGEgZGVwbG95bWVudCB3aG9zZSBvbi1jaGFpbgpgc3RvcmFnZV9zY2hlbWFfdmVyc2lvbmAgaXMgbmV3ZXIgdGhhbiB0aGlzIFdBU00ga25vd3MgYWJvdXQuAAAAABNTdG9yYWdlU2NoZW1hVG9vTmV3AAAAAAoAAAB5YHVwZ3JhZGVfc3RvcmFnZSgpYCB3YXMgY2FsbGVkIGJ1dCB0aGUgc2NoZW1hIGlzIGFscmVhZHkgYXQgb3IgYmV5b25kCnRoZSB2ZXJzaW9uIHRoaXMgV0FTTSBpbXBsZW1lbnRzIOKAlCBub3RoaW5nIHRvIGRvLgAAAAAAABNTdG9yYWdlU2NoZW1hVG9vT2xkAAAAAAsAAABCVGhlIGNvbnRyYWN0IGlzIHBhdXNlZCBhbmQgY2Fubm90IHBlcmZvcm0gdGhlIHJlcXVlc3RlZCBvcGVyYXRpb24uAAAAAAAOQ29udHJhY3RQYXVzZWQAAAAAAAwAAABCYHNldHRsZW1lbnRfcmVmYCB3YXMgZW1wdHkgb3IgZXhjZWVkZWQgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAAAAUSW52YWxpZFNldHRsZW1lbnRSZWYAAAANAAAARmBhY2NlcHRfYWRtaW4oKWAgd2FzIGNhbGxlZCBidXQgbm8gYWRtaW4gdHJhbnNmZXIgcHJvcG9zYWwgaXMgcGVuZGluZy4AAAAAAA5Ob1BlbmRpbmdBZG1pbgAAAAAADgAAAH5gcHJvcG9zZV9hZG1pbigpYCB3YXMgY2FsbGVkIHdoaWxlIGFuIGFkbWluIHRyYW5zZmVyIHByb3Bvc2FsIGlzCmFscmVhZHkgcGVuZGluZy4gT25seSBvbmUgaGFuZG9mZiBtYXkgYmUgaW4gZmxpZ2h0IGF0IGEgdGltZS4AAAAAABJQZW5kaW5nQWRtaW5FeGlzdHMAAAAAAA8AAACtYHByb3Bvc2VfYWRtaW4oKWAgd2FzIGNhbGxlZCB3aXRoIGFuIGludmFsaWQgcHJvcG9zZWQgYWRtaW4g4oCUIGZvcgpleGFtcGxlLCB0aGUgY3VycmVudCBhZG1pbiByZS1wcm9wb3NpbmcgdGhlbXNlbHZlcy4gQSB0cmFuc2ZlciBtdXN0CmhhbmQgdGhlIHJvbGUgdG8gYSBkaWZmZXJlbnQgYWRkcmVzcy4AAAAAAAAUSW52YWxpZFByb3Bvc2VkQWRtaW4AAAAQ",
        "AAAABQAAAAAAAAAAAAAADEFzc2V0UmV2b2tlZAAAAAEAAAANYXNzZXRfcmV2b2tlZAAAAAAAAAIAAAAAAAAABGNvZGUAAAAQAAAAAAAAAAAAAAAGaXNzdWVyAAAAAAAQAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAAABAAAAD2NvbnRyYWN0X3BhdXNlZAAAAAADAAAAAAAAAAZwYXVzZWQAAAAAAAEAAAAAAAAAAAAAAAx0cmlnZ2VyZWRfYnkAAAATAAAAAAAAAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEEFzc2V0QWxsb3dsaXN0ZWQAAAABAAAAEWFzc2V0X2FsbG93bGlzdGVkAAAAAAAAAgAAAAAAAAAEY29kZQAAABAAAAAAAAAAAAAAAAZpc3N1ZXIAAAAAABAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEk5hdGl2ZUFsbG93Q2hhbmdlZAAAAAAAAQAAABRuYXRpdmVfYWxsb3dfY2hhbmdlZAAAAAEAAAAAAAAAB2FsbG93ZWQAAAAAAQAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAFUFkbWluVHJhbnNmZXJBY2NlcHRlZAAAAAAAAAEAAAAXYWRtaW5fdHJhbnNmZXJfYWNjZXB0ZWQAAAAAAwAAACFBZG1pbiB0aGF0IHJlbGlucXVpc2hlZCB0aGUgcm9sZS4AAAAAAAAOcHJldmlvdXNfYWRtaW4AAAAAABMAAAAAAAAANEFkZHJlc3MgdGhhdCBhY2NlcHRlZCBhbmQgaXMgbm93IHRoZSBjb250cmFjdCBhZG1pbi4AAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAFUFkbWluVHJhbnNmZXJQcm9wb3NlZAAAAAAAAAEAAAAXYWRtaW5fdHJhbnNmZXJfcHJvcG9zZWQAAAAAAwAAACFBZG1pbiB0aGF0IGluaXRpYXRlZCB0aGUgaGFuZG9mZi4AAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAAAAAAAKkFkZHJlc3MgcHJvcG9zZWQgdG8gYmVjb21lIHRoZSBuZXh0IGFkbWluLgAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAAAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAFVN0b3JhZ2VTY2hlbWFVcGdyYWRlZAAAAAAAAAEAAAAXc3RvcmFnZV9zY2hlbWFfdXBncmFkZWQAAAAAAwAAAAAAAAAMZnJvbV92ZXJzaW9uAAAABAAAAAAAAAAAAAAACnRvX3ZlcnNpb24AAAAAAAQAAAAAAAAAAAAAAAt1cGdyYWRlZF9hdAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAFkludm9pY2VQYXltZW50UmVjb3JkZWQAAAAAAAEAAAAYaW52b2ljZV9wYXltZW50X3JlY29yZGVkAAAABwAAAAAAAAAOc2NoZW1hX3ZlcnNpb24AAAAAAAQAAAAAAAAAAAAAAAppbnZvaWNlX2lkAAAAAAAQAAAAAAAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAAAAAAKYXNzZXRfY29kZQAAAAAAEAAAAAAAAAAAAAAADGFzc2V0X2lzc3VlcgAAABAAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAA5zZXR0bGVtZW50X3JlZgAAAAAAEAAAAAAAAAAC",
        "AAAAAgAAALpBc3NldCB0eXBlIGVudW0gZm9yIG11bHRpLWFzc2V0IHN1cHBvcnQuCgpUaGlzIGVudW0gZGlzdGluZ3Vpc2hlcyBiZXR3ZWVuIG5hdGl2ZSBYTE0gYW5kIFN0ZWxsYXItaXNzdWVkIHRva2VucywKcHJvdmlkaW5nIGEgdHlwZS1zYWZlIHdheSB0byBoYW5kbGUgZGlmZmVyZW50IGFzc2V0IHR5cGVzIGluIHRoZSBjb250cmFjdC4AAAAAAAAAAAAFQXNzZXQAAAAAAAACAAAAAAAAACZOYXRpdmUgWExNIGFzc2V0IChubyBpc3N1ZXIgcmVxdWlyZWQpLgAAAAAABk5hdGl2ZQAAAAAAAQAAAJ1TdGVsbGFyLWlzc3VlZCB0b2tlbiB3aXRoIGNvZGUgYW5kIGlzc3Vlci4KRm9ybWF0OiAoYXNzZXRfY29kZSwgaXNzdWVyX2FkZHJlc3MpCkV4YW1wbGU6ICgiVVNEQyIsICJHQkJENDdJRjZMV0s3UDdNREVWU0NXUjdEUFVXVjNOWTNEVFFFVkZMNE5BVDRBUUgzWkxMRkxBNSIpAAAAAAAABVRva2VuAAAAAAAAAgAAABAAAAAQ",
        "AAAAAgAAALVBbGwga2V5cyB1c2VkIGluIHRoaXMgY29udHJhY3QncyBpbnN0YW5jZSBhbmQgcGVyc2lzdGVudCBzdG9yYWdlLgoKYCNbY29udHJhY3R0eXBlXWAgZW5jb2RlcyBlYWNoIHZhcmlhbnQgYXMgYW4gWERSIGBTY1ZhbGAsIHdoaWNoIFNvcm9iYW4KdXNlcyBhcyB0aGUgcmF3IHN0b3JhZ2Uga2V5IG9uIHRoZSBsZWRnZXIuAAAAAAAAAAAAAAdEYXRhS2V5AAAAAAsAAAAAAAAANVN0b3JlcyB0aGUgYWRtaW4gW2BBZGRyZXNzYF0gaW4gKippbnN0YW5jZSoqIHN0b3JhZ2UuAAAAAAAABUFkbWluAAAAAAAAAAAAADtSdW5uaW5nIGNvdW50IG9mIHJlY29yZGVkIHBheW1lbnRzIGluICoqaW5zdGFuY2UqKiBzdG9yYWdlLgAAAAAMUGF5bWVudENvdW50AAAAAAAAAElSdW5uaW5nIGNvdW50IG9mIGhpc3RvcnktaW5kZXhlZCBwYXltZW50IHJlY29yZHMgaW4gKippbnN0YW5jZSoqIHN0b3JhZ2UuAAAAAAAAE1BheW1lbnRIaXN0b3J5Q291bnQAAAAAAAAAADhDb250cmFjdC1sZXZlbCB2ZXJzaW9uIG1ldGFkYXRhIGluICoqaW5zdGFuY2UqKiBzdG9yYWdlLgAAAAxDb250cmFjdE1ldGEAAAABAAAAPkxlZ2FjeSBwcmUtdmVyc2lvbmluZyBrZXk6IGtlcHQgZm9yIGJhY2t3YXJkLWNvbXBhdGlibGUgcmVhZHMuAAAAAAAHUGF5bWVudAAAAAABAAAAEAAAAAEAAAA1U2NoZW1hIHYxIGtleTogYWN0aXZlIHdyaXRlIHBhdGggZm9yIHBheW1lbnQgcmVjb3Jkcy4AAAAAAAAJUGF5bWVudFYxAAAAAAAAAQAAABAAAAABAAAAOEFwcGVuZC1vbmx5IGhpc3RvcnkgaW5kZXggdXNlZCBmb3IgZGV0ZXJtaW5pc3RpYyBwYWdpbmcuAAAADlBheW1lbnRIaXN0b3J5AAAAAAABAAAABAAAAAEAAABZQWxsb3dsaXN0IGVudHJ5IGZvciBhIHRva2VuIGluICoqcGVyc2lzdGVudCoqIHN0b3JhZ2UuCktleTogQWxsb3dMaXN0KGFzc2V0X2NvZGUsIGlzc3VlcikAAAAAAAAJQWxsb3dMaXN0AAAAAAAAAgAAABAAAAAQAAAAAAAAADVGbGFnIGZvciBhbGxvd2luZyBuYXRpdmUgWExNIGluICoqaW5zdGFuY2UqKiBzdG9yYWdlLgAAAAAAAAtBbGxvd05hdGl2ZQAAAAAAAAAAQkZsYWcgaW5kaWNhdGluZyB3aGV0aGVyIHRoZSBjb250cmFjdCBpcyBwYXVzZWQgKGluc3RhbmNlIHN0b3JhZ2UpLgAAAAAABlBhdXNlZAAAAAAAAAAAAItBZGRyZXNzIHByb3Bvc2VkIGFzIHRoZSBuZXh0IGFkbWluIGJ5IGBwcm9wb3NlX2FkbWluKClgIGluICoqaW5zdGFuY2UqKgpzdG9yYWdlLiBSZWFkIGJ5IGBhY2NlcHRfYWRtaW4oKWAgdG8gY29tcGxldGUgdGhlIHR3by1zdGVwIGhhbmRvZmYuAAAAAAxQZW5kaW5nQWRtaW4=",
        "AAAAAQAAAAAAAAAAAAAADENvbnRyYWN0TWV0YQAAAAIAAAA1Q29udHJhY3QgY29kZSB2ZXJzaW9uIHRoYXQgbW9zdCByZWNlbnRseSB3cm90ZSBzdGF0ZS4AAAAAAAAQY29udHJhY3RfdmVyc2lvbgAAAAQAAAA4U3RvcmFnZSBsYXlvdXQvc2NoZW1hIHZlcnNpb24gaW4gdGhpcyBjb250cmFjdCBpbnN0YW5jZS4AAAAWc3RvcmFnZV9zY2hlbWFfdmVyc2lvbgAAAAAABA==",
        "AAAAAQAAAUFTdGFibGUsIGhpZ2gtbGV2ZWwgc3VtbWFyeSBvZiBhbGxvd2xpc3QgcG9saWN5IGZvciBpbnRlZ3JhdGlvbiBjb25zdW1lcnMuCgpgcmVxdWlyZXNfdG9rZW5fYWxsb3dsaXN0YCBpcyBjdXJyZW50bHkgYWx3YXlzIGB0cnVlYDogaXNzdWVkIGFzc2V0cyBtdXN0IGJlCmV4cGxpY2l0bHkgYWRkZWQgdmlhIGBhbGxvd19hc3NldChjb2RlLCBpc3N1ZXIpYCBiZWZvcmUgYHJlY29yZF9wYXltZW50YAphY2NlcHRzIHRoZW0uIGBuYXRpdmVfYWxsb3dlZGAgcmVmbGVjdHMgdGhlIG11dGFibGUgWExNIHRvZ2dsZSBjb250cm9sbGVkIGJ5CmBzZXRfYWxsb3dfbmF0aXZlYC4AAAAAAAAAAAAADUFsbG93bGlzdE1vZGUAAAAAAAACAAAAAAAAAA5uYXRpdmVfYWxsb3dlZAAAAAAAAQAAAAAAAAAYcmVxdWlyZXNfdG9rZW5fYWxsb3dsaXN0AAAAAQ==",
        "AAAAAQAAASJPbi1jaGFpbiBzbmFwc2hvdCBvZiBhIHNpbmdsZSBpbnZvaWNlIHBheW1lbnQuCgojIyBBc3NldCBlbmNvZGluZwpVc2VzIHRoZSBbYEFzc2V0YF0gZW51bSB0byBwcm92aWRlIHR5cGUtc2FmZSBtdWx0aS1hc3NldCBzdXBwb3J0LgoKIyMgQW1vdW50IHVuaXRzCi0gKipYTE0qKjogc3Ryb29wcyDigJQgMSBYTE0gPSAxMCAwMDAgMDAwIHN0cm9vcHMuCi0gKipPdGhlciB0b2tlbnMqKjogdGhlIHRva2VuJ3Mgb3duIHNtYWxsZXN0IHVuaXQKKFVTREMgb24gU3RlbGxhciB1c2VzIDcgZGVjaW1hbCBwbGFjZXMpLgAAAAAAAAAAAA1QYXltZW50UmVjb3JkAAAAAAAABgAAADpQYXltZW50IGFtb3VudCBpbiB0aGUgYXNzZXQncyBzbWFsbGVzdCB1bml0IChtdXN0IGJlID4gMCkuAAAAAAAGYW1vdW50AAAAAAALAAAAF0Fzc2V0IHR5cGUgYW5kIGRldGFpbHMuAAAAAAVhc3NldAAAAAAAB9AAAAAFQXNzZXQAAAAAAABvVW5pcXVlIGludm9pY2UgaWRlbnRpZmllci4KCk1hdGNoZXMgdGhlIG5hdGl2ZSBTdGVsbGFyIFBheW1lbnQgbWVtbyB1c2VkIGJ5IEludm9pc2lvOgpgImludm9pc2lvLTxpbnZvaWNlSWQ+ImAuAAAAAAppbnZvaWNlX2lkAAAAAAAQAAAALlN0ZWxsYXIgYWNjb3VudCBhZGRyZXNzIHRoYXQgc2VudCB0aGUgcGF5bWVudC4AAAAAAAVwYXllcgAAAAAAABMAAAFSTm9ybWFsaXNlZCBzZXR0bGVtZW50IHJlZmVyZW5jZSBmb3IgYmFja2VuZCBkZWR1cGxpY2F0aW9uIGFuZCBhdWRpdGluZy4KCkEgZGV0ZXJtaW5pc3RpYyBoYXNoIG9yIHJlZmVyZW5jZSBJRCAoZS5nLiBhIFNIQS0yNTYgaGV4IHN0cmluZyBvcgphIHdlbGwta25vd24gcmVjb25jaWxpYXRpb24gaWRlbnRpZmllcikgdGhhdCB0aGUgYmFja2VuZCB1c2VzIGZvcgppZGVtcG90ZW50IHNldHRsZW1lbnQgcmVjb25jaWxpYXRpb24uIFN0b3JlZCBvbi1jaGFpbiBzbyBhbnkgb2JzZXJ2ZXIKY2FuIHZlcmlmeSB0aGUgc2V0dGxlbWVudCByZWZlcmVuY2UgYXNzb2NpYXRlZCB3aXRoIGEgcGF5bWVudC4AAAAAAA5zZXR0bGVtZW50X3JlZgAAAAAAEAAAAENVbml4IHRpbWVzdGFtcCAoc2Vjb25kcykgc291cmNlZCBmcm9tIHRoZSBsZWRnZXIgYXQgcmVjb3JkaW5nIHRpbWUuAAAAAAl0aW1lc3RhbXAAAAAAAAAG",
        "AAAAAQAAAO1TdGFibGUgcmVhZCBtb2RlbCBmb3Igb3BzIHRvb2xpbmcgYW5kIGNsaWVudCBpbnRlZ3JhdGlvbnMuCgpSZXR1cm5lZCBieSB0aGUgY29udHJhY3QgYGNvbmZpZygpYCB2aWV3IHNvIGNvbnN1bWVycyBjYW4gaW5zcGVjdAppbml0aWFsaXphdGlvbiBzdGF0dXMsIGFkbWluIG93bmVyc2hpcCwgdmVyc2lvbiBtZXRhZGF0YSwgYW5kIGFsbG93bGlzdApwb2xpY3kgaW4gYSBzaW5nbGUgcGVybWlzc2lvbmxlc3MgY2FsbC4AAAAAAAAAAAAADkNvbnRyYWN0Q29uZmlnAAAAAAAGAAAARmBTb21lKGFkbWluKWAgb25jZSBgaW5pdGlhbGl6ZShhZG1pbilgIGhhcyBiZWVuIGNhbGxlZDsgYE5vbmVgIGJlZm9yZS4AAAAAAAVhZG1pbgAAAAAAA+gAAAATAAAAQkhpZ2gtbGV2ZWwgYXNzZXQgcG9saWN5IHNuYXBzaG90IGZvciBuYXRpdmUgWExNIGFuZCBpc3N1ZWQgdG9rZW5zLgAAAAAADmFsbG93bGlzdF9tb2RlAAAAAAfQAAAADUFsbG93bGlzdE1vZGUAAAAAAABMV2hldGhlciB0aGUgY29udHJhY3QgaGFzIGJlZW4gaW5pdGlhbGlzZWQgYW5kIGNhbiBhY2NlcHQgYWRtaW4tZ2F0ZWQgd3JpdGVzLgAAAAtpbml0aWFsaXplZAAAAAABAAAAO1doZXRoZXIgdGhlIGNvbnRyYWN0IGlzIGN1cnJlbnRseSBwYXVzZWQgKHdyaXRlcyBkaXNhYmxlZCkuAAAAAAZwYXVzZWQAAAAAAAEAAAB8VGhlIGFkZHJlc3MgYXdhaXRpbmcgYWNjZXB0YW5jZSB2aWEgYGFjY2VwdF9hZG1pbigpYCwgaWYgYHByb3Bvc2VfYWRtaW4oKWAKd2FzIGNhbGxlZC4gYE5vbmVgIHdoZW4gbm8gdHJhbnNmZXIgaXMgaW4gZmxpZ2h0LgAAAA1wZW5kaW5nX2FkbWluAAAAAAAD6AAAABMAAABDT24tY2hhaW4gdmVyc2lvbiBtZXRhZGF0YSBhc3NvY2lhdGVkIHdpdGggdGhlIGN1cnJlbnQgc3RvcmVkIHN0YXRlLgAAAAAHdmVyc2lvbgAAAAfQAAAADENvbnRyYWN0TWV0YQ==",
        "AAAAAQAAADRBIGJvdW5kZWQsIGN1cnNvci1mcmllbmRseSBzbGljZSBvZiBwYXltZW50IGhpc3RvcnkuAAAAAAAAABJQYXltZW50SGlzdG9yeVBhZ2UAAAAAAAMAAAA5VHJ1ZSB3aGVuIG1vcmUgZW50cmllcyBhcmUgYXZhaWxhYmxlIGFmdGVyIGBuZXh0X2N1cnNvcmAuAAAAAAAACGhhc19tb3JlAAAAAQAAACBDdXJzb3IgdG8gcGFzcyB0byB0aGUgbmV4dCBjYWxsLgAAAAtuZXh0X2N1cnNvcgAAAAAEAAAAH1JlY29yZHMgcmV0dXJuZWQgZm9yIHRoaXMgcGFnZS4AAAAAB3JlY29yZHMAAAAD6gAAB9AAAAANUGF5bWVudFJlY29yZAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<Result<string>>,
        config: this.txFromJSON<ContractConfig>,
        is_paused: this.txFromJSON<boolean>,
        initialize: this.txFromJSON<Result<void>>,
        set_paused: this.txFromJSON<Result<void>>,
        allow_asset: this.txFromJSON<Result<void>>,
        get_payment: this.txFromJSON<Result<PaymentRecord>>,
        has_payment: this.txFromJSON<boolean>,
        accept_admin: this.txFromJSON<Result<void>>,
        revoke_asset: this.txFromJSON<Result<void>>,
        version_info: this.txFromJSON<ContractMeta>,
        payment_count: this.txFromJSON<u32>,
        pending_admin: this.txFromJSON<Option<string>>,
        propose_admin: this.txFromJSON<Result<void>>,
        record_payment: this.txFromJSON<Result<void>>,
        payment_history: this.txFromJSON<PaymentHistoryPage>,
        upgrade_storage: this.txFromJSON<Result<void>>,
        contract_version: this.txFromJSON<u32>,
        set_allow_native: this.txFromJSON<Result<void>>,
        payments_by_payer: this.txFromJSON<PaymentHistoryPage>
  }
}