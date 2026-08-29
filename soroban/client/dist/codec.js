"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LEGACY_MIGRATION_BATCH = exports.MAX_SETTLEMENT_REF_LEN = exports.MAX_INVOICE_ID_LEN = void 0;
exports.decodeNamedEventPayload = decodeNamedEventPayload;
exports.validateEventSchemaVersion = validateEventSchemaVersion;
exports.isCanonicalIdentifier = isCanonicalIdentifier;
exports.assertCanonicalIdentifier = assertCanonicalIdentifier;
exports.encodeString = encodeString;
exports.encodeAddress = encodeAddress;
exports.encodeI128 = encodeI128;
exports.encodeU32 = encodeU32;
exports.encodeBool = encodeBool;
exports.encodeStringVec = encodeStringVec;
exports.encodeBytes32 = encodeBytes32;
exports.decodePaymentRecord = decodePaymentRecord;
exports.decodePaymentHistoryPage = decodePaymentHistoryPage;
exports.decodeContractConfig = decodeContractConfig;
exports.decodeSettlementRefOwner = decodeSettlementRefOwner;
exports.decodeSettlementRefPage = decodeSettlementRefPage;
exports.decodeAllowlistPage = decodeAllowlistPage;
exports.decodeSettlementRefIndexStatus = decodeSettlementRefIndexStatus;
exports.parseContractError = parseContractError;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("./types");
/** Decode contract-event data without treating declaration order as a schema. */
function decodeNamedEventPayload(value) {
    if (Array.isArray(value) || value === null || typeof value !== 'object') {
        throw new Error('event data is not a named struct');
    }
    return value;
}
/** Apply the single schema-version policy shared by every contract event. */
function validateEventSchemaVersion(payload, expectedVersion) {
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
exports.MAX_INVOICE_ID_LEN = 64;
/** Maximum length of `settlementRef` accepted by `record_payment` on-chain. */
exports.MAX_SETTLEMENT_REF_LEN = 128;
/**
 * Maximum number of invoice ids accepted in one `migrateLegacyPayments`
 * call. Mirrors `storage::MAX_LEGACY_MIGRATION_BATCH` — exceeding it fails
 * on-chain with `LegacyPaymentMigrationBatchTooLarge` rather than silently
 * truncating; split a larger backlog across multiple calls instead.
 */
exports.MAX_LEGACY_MIGRATION_BATCH = 20;
const CANONICAL_IDENTIFIER_PATTERN = /^[a-z0-9-]+$/;
/**
 * Returns `true` if `value` is non-empty, at most `maxLen` characters, and
 * consists solely of ASCII lowercase letters, digits, and hyphens.
 */
function isCanonicalIdentifier(value, maxLen) {
    return value.length > 0 && value.length <= maxLen && CANONICAL_IDENTIFIER_PATTERN.test(value);
}
/**
 * Throw a descriptive `Error` if `value` is not a canonical identifier —
 * empty, too long, or containing anything other than lowercase letters,
 * digits, and hyphens (e.g. uppercase, whitespace, or other punctuation).
 *
 * @param fieldName - used only in the thrown message, e.g. `"invoiceId"`.
 */
function assertCanonicalIdentifier(value, maxLen, fieldName) {
    if (value.length === 0) {
        throw new Error(`${fieldName} must not be empty`);
    }
    if (value.length > maxLen) {
        throw new Error(`${fieldName} must be at most ${maxLen} characters, got ${value.length}`);
    }
    if (!CANONICAL_IDENTIFIER_PATTERN.test(value)) {
        throw new Error(`${fieldName} must contain only lowercase letters, digits, and hyphens, got: ${value}`);
    }
}
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
function encodeBool(value) {
    return (0, stellar_sdk_1.nativeToScVal)(value, { type: 'bool' });
}
/** Encode a `Vec<String>` argument, e.g. for `migrate_legacy_payments`. */
function encodeStringVec(values) {
    return stellar_sdk_1.xdr.ScVal.scvVec(values.map((value) => encodeString(value)));
}
/**
 * Encode a hex-encoded 32-byte hash (e.g. a WASM hash) as a Soroban
 * `BytesN<32>` ScVal. Accepts an optional `0x` prefix.
 */
function encodeBytes32(hexHash) {
    const clean = hexHash.startsWith('0x') ? hexHash.slice(2) : hexHash;
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
        throw new Error(`Expected a 32-byte hex-encoded hash (64 hex chars), got: ${hexHash}`);
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return (0, stellar_sdk_1.nativeToScVal)(bytes, { type: 'bytes' });
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
        assetDecimals: Number(raw['asset_decimals'] ?? 0),
        timestamp: BigInt(raw['timestamp']),
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
 * - pending_admin
 * - initialized
 * - version.contract_version
 * - version.storage_schema_version
 * - allowlist_mode.native_allowed
 */
function decodeContractConfig(scVal) {
    const raw = (0, stellar_sdk_1.scValToNative)(scVal);
    const version = raw['version'];
    const allowlistMode = raw['allowlist_mode'];
    return {
        admin: raw['admin'] === null || raw['admin'] === undefined ? null : String(raw['admin']),
        pendingAdmin: raw['pending_admin'] === null || raw['pending_admin'] === undefined
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
function decodeSettlementRefOwner(scVal) {
    const native = (0, stellar_sdk_1.scValToNative)(scVal);
    return native === null || native === undefined ? null : String(native);
}
function decodeSettlementRefEntryFromNative(raw) {
    return {
        settlementRef: String(raw['settlement_ref']),
        invoiceId: String(raw['invoice_id']),
    };
}
/**
 * Decode a bounded settlement-reference page returned by
 * `settlement_ref_history()`.
 */
function decodeSettlementRefPage(scVal) {
    const raw = (0, stellar_sdk_1.scValToNative)(scVal);
    const records = raw['records'] ?? [];
    return {
        records: records.map((record) => decodeSettlementRefEntryFromNative(record)),
        nextCursor: Number(raw['next_cursor']),
        hasMore: Boolean(raw['has_more']),
        gapsSkipped: Number(raw['gaps_skipped']),
    };
}
function decodeAllowlistEntryFromNative(raw) {
    return {
        code: String(raw['code']),
        issuer: String(raw['issuer']),
    };
}
/**
 * Decode a bounded allowlist page returned by `allowed_assets()`.
 */
function decodeAllowlistPage(scVal) {
    const raw = (0, stellar_sdk_1.scValToNative)(scVal);
    const records = raw['records'] ?? [];
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
function decodeSettlementRefIndexStatus(scVal) {
    const [settlementRefCount, paymentCount, isConsistent] = (0, stellar_sdk_1.scValToNative)(scVal);
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
function parseContractError(errorString) {
    const match = CONTRACT_ERROR_RE.exec(errorString);
    // Group 1 = new SDK v14 format `Error(Contract, #N)`, group 2 = legacy `contractError(N)`
    const numericCode = match ? parseInt(match[1] ?? match[2], 10) : -1;
    const code = (0, types_1.getContractErrorCode)(numericCode);
    return new types_1.SorobanContractError(code, numericCode, `Soroban contract error: ${code} (code=${numericCode})`);
}
//# sourceMappingURL=codec.js.map