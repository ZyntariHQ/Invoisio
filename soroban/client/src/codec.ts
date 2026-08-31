import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';

import {
  AllowlistEntry,
  AllowlistPage,
  ContractConfig,
  Asset,
  ContractErrorCode,
  getContractErrorCode,
  PaymentHistoryPage,
  PaymentRecord,
  SettlementRefEntry,
  SettlementRefIndexStatus,
  SettlementRefPage,
  SorobanContractError,
} from './types';

export type NamedEventPayload = Record<string, unknown>;

/** Decode contract-event data without treating declaration order as a schema. */
export function decodeNamedEventPayload(value: unknown): NamedEventPayload {
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    throw new Error('event data is not a named struct');
  }
  return value as NamedEventPayload;
}

/** Apply the single schema-version policy shared by every contract event. */
export function validateEventSchemaVersion(
  payload: NamedEventPayload,
  expectedVersion: number,
): { schemaVersion: number } | { reason: string } {
  const schemaVersion = Number(payload['schema_version']);
  if (schemaVersion !== expectedVersion) {
    return {
      reason: `unsupported schema version ${schemaVersion} (client supports ${expectedVersion})`,
    };
  }
  return { schemaVersion };
}

// ─── Identifier canonicalisation ─────────────────────────────────────────────
//
// Mirrors `storage::is_canonical_identifier` and the length bounds enforced
// on-chain by `record_payment` in
// `soroban/contracts/invoice-payment/src/lib.rs`. Validating here lets a
// caller fail locally — before spending a transaction — instead of learning
// about a malformed `invoiceId` or `settlementRef` from a simulation error.
//
// Canonical form (both fields): ASCII lowercase letters (`a`-`z`), digits
// (`0`-`9`), and hyphens (`-`) only. The contract rejects anything else
// (uppercase, whitespace, other punctuation) rather than normalising it, so
// this client mirrors that rejection rather than silently lower-casing or
// trimming input on the caller's behalf.

/** Maximum length of `invoiceId` accepted by `record_payment` on-chain. */
export const MAX_INVOICE_ID_LEN = 64;

/** Maximum length of `settlementRef` accepted by `record_payment` on-chain. */
export const MAX_SETTLEMENT_REF_LEN = 128;

/**
 * Maximum number of invoice ids accepted in one `migrateLegacyPayments`
 * call. Mirrors `storage::MAX_LEGACY_MIGRATION_BATCH` — exceeding it fails
 * on-chain with `LegacyPaymentMigrationBatchTooLarge` rather than silently
 * truncating; split a larger backlog across multiple calls instead.
 */
export const MAX_LEGACY_MIGRATION_BATCH = 20;

/**
 * Maximum number of payment records/history slots extended in one
 * `extendHistoryTtl` call. Mirrors `storage::MAX_TTL_EXTEND_BATCH`.
 */
export const MAX_TTL_EXTEND_BATCH = 20;

const CANONICAL_IDENTIFIER_PATTERN = /^[a-z0-9-]+$/;

/**
 * Returns `true` if `value` is non-empty, at most `maxLen` characters, and
 * consists solely of ASCII lowercase letters, digits, and hyphens.
 */
export function isCanonicalIdentifier(value: string, maxLen: number): boolean {
  return value.length > 0 && value.length <= maxLen && CANONICAL_IDENTIFIER_PATTERN.test(value);
}

/**
 * Throw a descriptive `Error` if `value` is not a canonical identifier —
 * empty, too long, or containing anything other than lowercase letters,
 * digits, and hyphens (e.g. uppercase, whitespace, or other punctuation).
 *
 * @param fieldName - used only in the thrown message, e.g. `"invoiceId"`.
 */
export function assertCanonicalIdentifier(
  value: string,
  maxLen: number,
  fieldName: string,
): void {
  if (value.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }
  if (value.length > maxLen) {
    throw new Error(`${fieldName} must be at most ${maxLen} characters, got ${value.length}`);
  }
  if (!CANONICAL_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${fieldName} must contain only lowercase letters, digits, and hyphens, got: ${value}`,
    );
  }
}

// ─── Encoders (TypeScript → XDR ScVal) ───────────────────────────────────────

export function encodeString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'string' });
}

export function encodeAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

/**
 * Encode the contract `Asset` enum for `record_payment`.
 *
 * Native XLM is the `Native` unit variant — an empty `issuer` maps here, so
 * callers can keep passing `assetCode: 'XLM', assetIssuer: ''`. A token is
 * `Token(code, Address)`: a malformed issuer fails at `new Address(...)`
 * rather than being written on-chain.
 */
export function encodeAsset(code: string, issuer: string): xdr.ScVal {
  if (!issuer) {
    return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Native')]);
  }
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Token'),
    encodeString(code),
    encodeAddress(issuer),
  ]);
}

/**
 * Encode a BigInt as a Soroban i128 ScVal.
 * Soroban stores token amounts as i128 to safely cover the full range of
 * 7-decimal fixed-point values without floating-point rounding.
 */
export function encodeI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

export function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

export function encodeBool(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: 'bool' });
}

/** Encode a `Vec<String>` argument, e.g. for `migrate_legacy_payments`. */
export function encodeStringVec(values: string[]): xdr.ScVal {
  return xdr.ScVal.scvVec(values.map((value) => encodeString(value)));
}

/**
 * Encode a hex-encoded 32-byte hash (e.g. a WASM hash) as a Soroban
 * `BytesN<32>` ScVal. Accepts an optional `0x` prefix.
 */
export function encodeBytes32(hexHash: string): xdr.ScVal {
  const clean = hexHash.startsWith('0x') ? hexHash.slice(2) : hexHash;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`Expected a 32-byte hex-encoded hash (64 hex chars), got: ${hexHash}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return nativeToScVal(bytes, { type: 'bytes' });
}

// ─── Decoders (XDR ScVal → TypeScript) ───────────────────────────────────────

/**
 * Decode the `Asset` enum returned by the contract.
 *
 * Soroban encodes `#[contracttype]` enums as XDR vectors:
 *   - Unit variant:  `ScvVec([ ScvSymbol("Native") ])`
 *   - Tuple variant: `ScvVec([ ScvSymbol("Token"), ScvVec([code, issuer]) ])`
 *
 * After `scValToNative` this becomes either:
 *   - `["Native"]`
 *   - `["Token", [code, issuer]]`
 *
 * Both the array form and a legacy object form are handled for robustness
 * across stellar-sdk minor versions.
 */
function decodeAsset(raw: unknown): Asset {
  if (Array.isArray(raw)) {
    const [variantName, fields] = raw as [string, unknown];
    if (variantName === 'Native') return { type: 'native' };
    if (variantName === 'Token') {
      const parts = Array.isArray(fields) ? (fields as string[]) : (raw.slice(1) as string[]);
      return { type: 'token', code: String(parts[0]), issuer: String(parts[1]) };
    }
  }

  // Fallback: object-style encoding { Native: null } or { Token: [code, issuer] }
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('Native' in obj) return { type: 'native' };
    if ('Token' in obj) {
      const parts = obj['Token'] as unknown[];
      return { type: 'token', code: String(parts[0]), issuer: String(parts[1]) };
    }
  }

  throw new Error(`Unexpected Asset XDR encoding: ${JSON.stringify(raw)}`);
}

function decodePaymentRecordFromNative(raw: Record<string, unknown>): PaymentRecord {
  return {
    invoiceId: String(raw['invoice_id']),
    payer: String(raw['payer']),
    asset: decodeAsset(raw['asset']),
    amount: BigInt(raw['amount'] as bigint | number | string),
    assetDecimals: Number(raw['asset_decimals'] ?? 0),
    timestamp: BigInt(raw['timestamp'] as bigint | number | string),
    settlementRef: String(raw['settlement_ref']),
  };
}

/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount,
 * timestamp, settlement_ref.
 * Time:  O(1) — fixed number of fields.
 * Space: O(1) — fixed-size output struct.
 */
export function decodePaymentRecord(scVal: xdr.ScVal): PaymentRecord {
  return decodePaymentRecordFromNative(scValToNative(scVal) as Record<string, unknown>);
}

/**
 * Decode a bounded payment-history page returned by `payment_history()`.
 */
export function decodePaymentHistoryPage(scVal: xdr.ScVal): PaymentHistoryPage {
  const raw = scValToNative(scVal) as Record<string, unknown>;
  const records = (raw['records'] as Record<string, unknown>[] | undefined) ?? [];

  return {
    records: records.map((record) => decodePaymentRecordFromNative(record)),
    nextCursor: Number(raw['next_cursor']),
    hasMore: Boolean(raw['has_more']),
    gapsSkipped: Number(raw['gaps_skipped'] ?? 0),
    archivedSkipped: Number(raw['archived_skipped'] ?? 0),
  };
}

/**
 * Decode the stable `config()` response returned by the contract.
 *
 * Rust fields are snake_case:
 * - admin
 * - pending_admin
 * - initialized
 * - version.contract_version
 * - version.storage_schema_version
 * - allowlist_mode.native_allowed
 */
export function decodeContractConfig(scVal: xdr.ScVal): ContractConfig {
  const raw = scValToNative(scVal) as Record<string, unknown>;
  const version = raw['version'] as Record<string, unknown>;
  const allowlistMode = raw['allowlist_mode'] as Record<string, unknown>;

  return {
    admin:
      raw['admin'] === null || raw['admin'] === undefined ? null : String(raw['admin']),
    pendingAdmin:
      raw['pending_admin'] === null || raw['pending_admin'] === undefined
        ? null
        : String(raw['pending_admin']),
    initialized: Boolean(raw['initialized']),
    version: {
      contractVersion: Number(version['contract_version']),
      storageSchemaVersion: Number(version['storage_schema_version']),
    },
    allowlistMode: {
      nativeAllowed: Boolean(allowlistMode['native_allowed']),
    },
    paused: Boolean(raw['paused']),
  };
}

/**
 * Decode the `Option<String>` returned by `settlement_ref_owner()`.
 *
 * `scValToNative` resolves an absent Soroban `Option` to `null` or
 * `undefined` depending on SDK version; both map to `null` here so callers
 * get a single, unambiguous "not found" sentinel rather than an error (issue
 * #495) — the same convention `getPendingAdmin()` already uses.
 */
export function decodeSettlementRefOwner(scVal: xdr.ScVal): string | null {
  const native = scValToNative(scVal);
  return native === null || native === undefined ? null : String(native);
}

function decodeSettlementRefEntryFromNative(raw: Record<string, unknown>): SettlementRefEntry {
  return {
    settlementRef: String(raw['settlement_ref']),
    invoiceId: String(raw['invoice_id']),
  };
}

/**
 * Decode a bounded settlement-reference page returned by
 * `settlement_ref_history()`.
 */
export function decodeSettlementRefPage(scVal: xdr.ScVal): SettlementRefPage {
  const raw = scValToNative(scVal) as Record<string, unknown>;
  const records = (raw['records'] as Record<string, unknown>[] | undefined) ?? [];

  return {
    records: records.map((record) => decodeSettlementRefEntryFromNative(record)),
    nextCursor: Number(raw['next_cursor']),
    hasMore: Boolean(raw['has_more']),
    gapsSkipped: Number(raw['gaps_skipped']),
  };
}

function decodeAllowlistEntryFromNative(raw: Record<string, unknown>): AllowlistEntry {
  return {
    code: String(raw['code']),
    issuer: String(raw['issuer']),
  };
}

/**
 * Decode a bounded allowlist page returned by `allowed_assets()`.
 */
export function decodeAllowlistPage(scVal: xdr.ScVal): AllowlistPage {
  const raw = scValToNative(scVal) as Record<string, unknown>;
  const records = (raw['records'] as Record<string, unknown>[] | undefined) ?? [];

  return {
    records: records.map((record) => decodeAllowlistEntryFromNative(record)),
    nextCursor: Number(raw['next_cursor']),
    hasMore: Boolean(raw['has_more']),
    gapsSkipped: Number(raw['gaps_skipped']),
  };
}

/**
 * Decode the `(u32, u32, bool)` tuple returned by
 * `settlement_ref_index_status()`.
 */
export function decodeSettlementRefIndexStatus(scVal: xdr.ScVal): SettlementRefIndexStatus {
  const [settlementRefCount, paymentCount, isConsistent] = scValToNative(scVal) as [
    number,
    number,
    boolean,
  ];
  return {
    settlementRefCount: Number(settlementRefCount),
    paymentCount: Number(paymentCount),
    isConsistent: Boolean(isConsistent),
  };
}

// ─── Error parsing ────────────────────────────────────────────────────────────

/**
 * Matches the numeric code in Soroban host error strings.
 * SDK v14 format: `Error(Contract, #3)`
 * Legacy format:  `contractError(3)`
 */
const CONTRACT_ERROR_RE = /Error\(Contract,\s*#(\d+)\)|contractError\((\d+)\)/;

/**
 * Parse a Soroban simulation or host error string into a typed `SorobanContractError`.
 * The numeric code is resolved against `CONTRACT_ERROR_MANIFEST`; returns code
 * `Unknown` (-1) when the numeric code is not in the known set.
 */
export function parseContractError(errorString: string): SorobanContractError {
  const match = CONTRACT_ERROR_RE.exec(errorString);
  // Group 1 = new SDK v14 format `Error(Contract, #N)`, group 2 = legacy `contractError(N)`
  const numericCode = match ? parseInt(match[1] ?? match[2], 10) : -1;
  const code: ContractErrorCode = getContractErrorCode(numericCode);

  return new SorobanContractError(
    code,
    numericCode,
    `Soroban contract error: ${code} (code=${numericCode})`,
  );
}
