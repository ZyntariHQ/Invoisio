import { xdr } from '@stellar/stellar-sdk';
import { PaymentRecord, SorobanContractError } from './types';
export declare function encodeString(value: string): xdr.ScVal;
export declare function encodeAddress(address: string): xdr.ScVal;
/**
 * Encode a BigInt as a Soroban i128 ScVal.
 * Soroban stores token amounts as i128 to safely cover the full range of
 * 7-decimal fixed-point values without floating-point rounding.
 */
export declare function encodeI128(value: bigint): xdr.ScVal;
/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount, timestamp.
 * Time:  O(1) — fixed number of fields.
 * Space: O(1) — fixed-size output struct.
 */
export declare function decodePaymentRecord(scVal: xdr.ScVal): PaymentRecord;
/**
 * Parse a Soroban simulation or host error string into a typed `SorobanContractError`.
 * Returns code `Unknown` (-1) when the numeric code is not in the known set.
 */
export declare function parseContractError(errorString: string): SorobanContractError;
//# sourceMappingURL=codec.d.ts.map