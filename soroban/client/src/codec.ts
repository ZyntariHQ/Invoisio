import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';

import {
  ContractConfig,
  Asset,
  CONTRACT_ERROR_CODES,
  ContractErrorCode,
  PaymentHistoryPage,
  PaymentRecord,
  SorobanContractError,
} from './types';

// ─── Encoders (TypeScript → XDR ScVal) ───────────────────────────────────────

export function encodeString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'string' });
}

export function encodeAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
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
    timestamp: BigInt(raw['timestamp'] as bigint | number | string),
  };
}

/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount, timestamp.
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
  };
}

/**
 * Decode the stable `config()` response returned by the contract.
 *
 * Rust fields are snake_case:
 * - admin
 * - initialized
 * - version.contract_version
 * - version.storage_schema_version
 * - allowlist_mode.native_allowed
 * - allowlist_mode.requires_token_allowlist
 */
export function decodeContractConfig(scVal: xdr.ScVal): ContractConfig {
  const raw = scValToNative(scVal) as Record<string, unknown>;
  const version = raw['version'] as Record<string, unknown>;
  const allowlistMode = raw['allowlist_mode'] as Record<string, unknown>;

  return {
    admin:
      raw['admin'] === null || raw['admin'] === undefined ? null : String(raw['admin']),
    initialized: Boolean(raw['initialized']),
    version: {
      contractVersion: Number(version['contract_version']),
      storageSchemaVersion: Number(version['storage_schema_version']),
    },
    allowlistMode: {
      nativeAllowed: Boolean(allowlistMode['native_allowed']),
      requiresTokenAllowlist: Boolean(
        allowlistMode['requires_token_allowlist'],
      ),
    },
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
 * Returns code `Unknown` (-1) when the numeric code is not in the known set.
 */
export function parseContractError(errorString: string): SorobanContractError {
  const match = CONTRACT_ERROR_RE.exec(errorString);
  // Group 1 = new SDK v14 format `Error(Contract, #N)`, group 2 = legacy `contractError(N)`
  const numericCode = match ? parseInt(match[1] ?? match[2], 10) : -1;
  const code: ContractErrorCode =
    numericCode in CONTRACT_ERROR_CODES
      ? (CONTRACT_ERROR_CODES as Record<number, ContractErrorCode>)[numericCode]
      : 'Unknown';

  return new SorobanContractError(
    code,
    numericCode,
    `Soroban contract error: ${code} (code=${numericCode})`,
  );
}
