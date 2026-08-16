// ─── Contract error manifest ─────────────────────────────────────────────────
//
// This module is the single source of truth for the error codes the Invoisio
// invoice-payment Soroban contract can return. It mirrors
// `soroban/contracts/invoice-payment/src/errors.rs` exactly:
//
//   Rust `ContractError` variant  ⇄  `name` here
//   `#[contracterror]` discriminant  ⇄  `code` here
//
// Off-chain consumers (the TS client, the backend, UI tooling) should rely on
// this manifest instead of hand-maintained copies so that error handling stays
// aligned between the contract and off-chain integrations.
//
// ## Evolving the manifest
//
// Error codes are part of the on-chain ABI (`ScError::Contract(u32)`), so they
// are permanent once deployed. To add a new error:
//
//   1. Append a new variant at the **end** of `ContractError` in
//      `soroban/contracts/invoice-payment/src/errors.rs` — never reorder or
//      remove existing variants, and never reuse a retired numeric code.
//   2. Append the matching entry here with the same numeric `code` and a
//      `name` identical to the Rust variant (camelCase).
//   3. Extend the regression tests in `src/error-manifest.test.ts` so the new
//      code is covered by `parseContractError` mapping tests.
//   4. Update the "Contract error codes" table in `soroban/README.md`.
//   5. Rebuild the client (`npm run build` in `soroban/client`) — `dist/` is
//      committed so downstream `@invoisio/soroban-client` consumers get the
//      updated manifest.
//
// The `ContractErrorCode` union and `CONTRACT_ERROR_CODES` lookup are derived
// from `CONTRACT_ERROR_MANIFEST`, so they can never drift out of sync with it.

/** A single stable contract error: its on-chain numeric code, name, and meaning. */
export interface ContractErrorManifestEntry {
  /**
   * Numeric code surfaced as `ScError::Contract(u32)` — stable part of the
   * on-chain ABI. Never reused.
   */
  readonly code: number;
  /** Stable name matching the Rust `ContractError` variant (camelCase). */
  readonly name: string;
  /** Human-readable meaning: the condition under which the contract raises this error. */
  readonly meaning: string;
}

/**
 * Typed manifest of every error the invoice-payment contract can return.
 * Keep in sync with `soroban/contracts/invoice-payment/src/errors.rs`.
 */
export const CONTRACT_ERROR_MANIFEST = [
  {
    code: 1,
    name: 'AlreadyInitialized',
    meaning: 'initialize() was called on a contract that is already set up.',
  },
  {
    code: 2,
    name: 'NotInitialized',
    meaning: 'A method that requires admin was called before initialize().',
  },
  {
    code: 3,
    name: 'PaymentAlreadyRecorded',
    meaning:
      'record_payment() was called with an invoice_id that was already recorded; each invoice may be recorded exactly once.',
  },
  {
    code: 4,
    name: 'PaymentNotFound',
    meaning: 'get_payment() was called for an invoice_id that has no record.',
  },
  {
    code: 5,
    name: 'InvalidAmount',
    meaning: 'amount was zero or negative; all payments must be strictly positive.',
  },
  {
    code: 6,
    name: 'InvalidInvoiceId',
    meaning: 'invoice_id was an empty string; every payment must reference a non-empty invoice identifier.',
  },
  {
    code: 7,
    name: 'InvalidAsset',
    meaning:
      'asset_code was empty, or a non-XLM asset was supplied without an asset_issuer; every payment must identify the asset unambiguously.',
  },
  {
    code: 8,
    name: 'AssetNotAllowed',
    meaning: 'The asset (code, issuer pair) is not in the admin-controlled allowlist.',
  },
  {
    code: 9,
    name: 'Unauthorized',
    meaning: 'The caller is not authorized to perform this operation.',
  },
  {
    code: 10,
    name: 'StorageSchemaTooNew',
    meaning:
      'upgrade_storage() was called on a deployment whose on-chain storage_schema_version is newer than this WASM knows about.',
  },
  {
    code: 11,
    name: 'StorageSchemaTooOld',
    meaning:
      'upgrade_storage() was called but the schema is already at or beyond the version this WASM implements — nothing to do.',
  },
  {
    code: 12,
    name: 'ContractPaused',
    meaning: 'The contract is paused and cannot perform the requested operation.',
  },
  {
    code: 13,
    name: 'InvalidSettlementRef',
    meaning: 'settlement_ref was empty or exceeded the maximum allowed length.',
  },
  {
    code: 14,
    name: 'NoPendingAdmin',
    meaning:
      'accept_admin() was called but no admin transfer proposal is pending.',
  },
  {
    code: 15,
    name: 'PendingAdminExists',
    meaning:
      'propose_admin() was called while an admin transfer proposal is already pending; only one handoff may be in flight at a time.',
  },
  {
    code: 16,
    name: 'InvalidProposedAdmin',
    meaning:
      'propose_admin() was called with an invalid proposed admin, e.g. the current admin re-proposing themselves.',
  },
] as const satisfies readonly ContractErrorManifestEntry[];

/** Union of every known contract error name (excludes the `Unknown` fallback). */
export type ContractErrorName = (typeof CONTRACT_ERROR_MANIFEST)[number]['name'];

/** A known contract error name, or `Unknown` when the numeric code is not mapped. */
export type ContractErrorCode = ContractErrorName | 'Unknown';

/**
 * Numeric code → stable name, derived from `CONTRACT_ERROR_MANIFEST`.
 * Kept for backward compatibility with existing consumers.
 */
export const CONTRACT_ERROR_CODES: Readonly<Record<number, ContractErrorName>> =
  Object.fromEntries(CONTRACT_ERROR_MANIFEST.map((entry) => [entry.code, entry.name])) as Record<
    number,
    ContractErrorName
  >;

/** Look up the full manifest entry for a numeric code; `undefined` if unmapped. */
export function getContractError(code: number): ContractErrorManifestEntry | undefined {
  return CONTRACT_ERROR_MANIFEST.find((entry) => entry.code === code);
}

/**
 * Map a numeric contract error code to its stable name.
 * Returns `'Unknown'` when the code is not in the manifest.
 */
export function getContractErrorCode(code: number): ContractErrorCode {
  return CONTRACT_ERROR_CODES[code] ?? 'Unknown';
}
