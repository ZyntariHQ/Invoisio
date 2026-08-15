"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeString = encodeString;
exports.encodeAddress = encodeAddress;
exports.encodeI128 = encodeI128;
exports.encodeU32 = encodeU32;
exports.decodePaymentRecord = decodePaymentRecord;
exports.decodePaymentHistoryPage = decodePaymentHistoryPage;
exports.decodeContractConfig = decodeContractConfig;
exports.parseContractError = parseContractError;
exports.decodeInvoicePaymentRecordedEvent = decodeInvoicePaymentRecordedEvent;
exports.decodeAssetAllowlistedEvent = decodeAssetAllowlistedEvent;
exports.decodeAssetRevokedEvent = decodeAssetRevokedEvent;
exports.decodeNativeAllowChangedEvent = decodeNativeAllowChangedEvent;
exports.decodeStorageSchemaUpgradedEvent = decodeStorageSchemaUpgradedEvent;
exports.decodeContractPausedEvent = decodeContractPausedEvent;
exports.decodeContractEvent = decodeContractEvent;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("./types");
// ─── Encoders (TypeScript → XDR ScVal) ───────────────────────────────────────
function encodeString(value) {
    return (0, stellar_sdk_1.nativeToScVal)(value, { type: 'string' });
}
function encodeAddress(address) {
    return new stellar_sdk_1.Address(address).toScVal();
}
/**
 * Encode a BigInt as a Soroban i128 ScVal.
 * Soroban stores token amounts as i128 to safely cover the full range of
 * 7-decimal fixed-point values without floating-point rounding.
 */
function encodeI128(value) {
    return (0, stellar_sdk_1.nativeToScVal)(value, { type: 'i128' });
}
function encodeU32(value) {
    return (0, stellar_sdk_1.nativeToScVal)(value, { type: 'u32' });
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
function decodeAsset(raw) {
    if (Array.isArray(raw)) {
        const [variantName, fields] = raw;
        if (variantName === 'Native')
            return { type: 'native' };
        if (variantName === 'Token') {
            const parts = Array.isArray(fields) ? fields : raw.slice(1);
            return { type: 'token', code: String(parts[0]), issuer: String(parts[1]) };
        }
    }
    // Fallback: object-style encoding { Native: null } or { Token: [code, issuer] }
    if (raw !== null && typeof raw === 'object') {
        const obj = raw;
        if ('Native' in obj)
            return { type: 'native' };
        if ('Token' in obj) {
            const parts = obj['Token'];
            return { type: 'token', code: String(parts[0]), issuer: String(parts[1]) };
        }
    }
    throw new Error(`Unexpected Asset XDR encoding: ${JSON.stringify(raw)}`);
}
function decodePaymentRecordFromNative(raw) {
    return {
        invoiceId: String(raw['invoice_id']),
        payer: String(raw['payer']),
        asset: decodeAsset(raw['asset']),
        amount: BigInt(raw['amount']),
        timestamp: BigInt(raw['timestamp']),
    };
}
/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount, timestamp.
 * Time:  O(1) — fixed number of fields.
 * Space: O(1) — fixed-size output struct.
 */
function decodePaymentRecord(scVal) {
    return decodePaymentRecordFromNative((0, stellar_sdk_1.scValToNative)(scVal));
}
/**
 * Decode a bounded payment-history page returned by `payment_history()`.
 */
function decodePaymentHistoryPage(scVal) {
    const raw = (0, stellar_sdk_1.scValToNative)(scVal);
    const records = raw['records'] ?? [];
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
function decodeContractConfig(scVal) {
    const raw = (0, stellar_sdk_1.scValToNative)(scVal);
    const version = raw['version'];
    const allowlistMode = raw['allowlist_mode'];
    return {
        admin: raw['admin'] === null || raw['admin'] === undefined ? null : String(raw['admin']),
        initialized: Boolean(raw['initialized']),
        version: {
            contractVersion: Number(version['contract_version']),
            storageSchemaVersion: Number(version['storage_schema_version']),
        },
        allowlistMode: {
            nativeAllowed: Boolean(allowlistMode['native_allowed']),
            requiresTokenAllowlist: Boolean(allowlistMode['requires_token_allowlist']),
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
function parseContractError(errorString) {
    const match = CONTRACT_ERROR_RE.exec(errorString);
    // Group 1 = new SDK v14 format `Error(Contract, #N)`, group 2 = legacy `contractError(N)`
    const numericCode = match ? parseInt(match[1] ?? match[2], 10) : -1;
    const code = numericCode in types_1.CONTRACT_ERROR_CODES
        ? types_1.CONTRACT_ERROR_CODES[numericCode]
        : 'Unknown';
    return new types_1.SorobanContractError(code, numericCode, `Soroban contract error: ${code} (code=${numericCode})`);
}
// ─── Event Decoding ───────────────────────────────────────────────────────────
function normalizeEventPayload(rawOrScVal) {
    if (rawOrScVal !== null && typeof rawOrScVal === 'object' && 'switch' in rawOrScVal) {
        return (0, stellar_sdk_1.scValToNative)(rawOrScVal);
    }
    if (rawOrScVal !== null && typeof rawOrScVal === 'object') {
        return rawOrScVal;
    }
    throw new Error(`Invalid event payload format: ${JSON.stringify(rawOrScVal)}`);
}
function decodeInvoicePaymentRecordedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'invoice_payment_recorded',
        schemaVersion: Number(raw['schema_version'] ?? 1),
        invoiceId: String(raw['invoice_id'] ?? ''),
        payer: String(raw['payer'] ?? ''),
        assetCode: String(raw['asset_code'] ?? ''),
        assetIssuer: String(raw['asset_issuer'] ?? ''),
        amount: BigInt(raw['amount'] ?? 0),
        settlementRef: String(raw['settlement_ref'] ?? ''),
    };
}
function decodeAssetAllowlistedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'asset_allowlisted',
        code: String(raw['code'] ?? ''),
        issuer: String(raw['issuer'] ?? ''),
    };
}
function decodeAssetRevokedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'asset_revoked',
        code: String(raw['code'] ?? ''),
        issuer: String(raw['issuer'] ?? ''),
    };
}
function decodeNativeAllowChangedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'native_allow_changed',
        allowed: Boolean(raw['allowed']),
    };
}
function decodeStorageSchemaUpgradedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'storage_schema_upgraded',
        fromVersion: Number(raw['from_version'] ?? 0),
        toVersion: Number(raw['to_version'] ?? 0),
        upgradedAt: BigInt(raw['upgraded_at'] ?? 0),
    };
}
function decodeContractPausedEvent(rawOrScVal) {
    const raw = normalizeEventPayload(rawOrScVal);
    return {
        type: 'contract_paused',
        paused: Boolean(raw['paused']),
        triggeredBy: String(raw['triggered_by'] ?? ''),
        timestamp: BigInt(raw['timestamp'] ?? 0),
    };
}
/**
 * Decode a generic Soroban event into a typed InvoisioContractEvent based on its topic.
 */
function decodeContractEvent(event) {
    const firstTopic = event.topic[0];
    const topicName = typeof firstTopic === 'string'
        ? firstTopic
        : String((0, stellar_sdk_1.scValToNative)(firstTopic));
    switch (topicName) {
        case 'InvoicePaymentRecorded':
        case 'invoice_payment_recorded':
            return decodeInvoicePaymentRecordedEvent(event.data);
        case 'AssetAllowlisted':
        case 'asset_allowlisted':
            return decodeAssetAllowlistedEvent(event.data);
        case 'AssetRevoked':
        case 'asset_revoked':
            return decodeAssetRevokedEvent(event.data);
        case 'NativeAllowChanged':
        case 'native_allow_changed':
            return decodeNativeAllowChangedEvent(event.data);
        case 'StorageSchemaUpgraded':
        case 'storage_schema_upgraded':
            return decodeStorageSchemaUpgradedEvent(event.data);
        case 'ContractPaused':
        case 'contract_paused':
            return decodeContractPausedEvent(event.data);
        default:
            throw new Error(`Unknown contract event topic: ${topicName}`);
    }
}
//# sourceMappingURL=codec.js.map