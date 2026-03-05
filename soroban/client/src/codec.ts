import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';

import {
  Asset,
  CONTRACT_ERROR_CODES,
  ContractErrorCode,
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

/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount, timestamp.
 * Time:  O(1) — fixed number of fields.
 * Space: O(1) — fixed-size output struct.
 */
export function decodePaymentRecord(scVal: xdr.ScVal): PaymentRecord {
  const raw = scValToNative(scVal) as Record<string, unknown>;

  return {
    invoiceId: String(raw['invoice_id']),
    payer: String(raw['payer']),
    asset: decodeAsset(raw['asset']),
    amount: BigInt(raw['amount'] as bigint | number | string),
    timestamp: BigInt(raw['timestamp'] as bigint | number | string),
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
