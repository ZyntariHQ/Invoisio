"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_SCHEMA_VERSION = void 0;
exports.decodeSorobanEvent = decodeSorobanEvent;
exports.decodeEventStream = decodeEventStream;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const codec_1 = require("./codec");
/**
 * Schema version of the `invoice_payment_recorded` event payload that this
 * client knows how to decode. Mirrors `EVENT_SCHEMA_VERSION` in
 * `contracts/invoice-payment/src/events.rs` — bump both together when the
 * payload shape changes in a breaking way.
 */
exports.EVENT_SCHEMA_VERSION = 2;
function parseScVal(value) {
    return typeof value === 'string' ? stellar_sdk_1.xdr.ScVal.fromXDR(value, 'base64') : value;
}
function toBigInt(value, field) {
    try {
        return BigInt(value);
    }
    catch {
        throw new Error(`Field ${field} is not integer-like: ${JSON.stringify(value)}`);
    }
}
/**
 * Decode a `BytesN<32>` field (e.g. a WASM hash) into a lowercase hex string.
 * `scValToNative` returns raw bytes for an `ScBytes` as a `Uint8Array`
 * (`Buffer` in Node, which extends it); a string is passed through as-is for
 * callers that already normalised the value upstream.
 */
function toHex(value, field) {
    if (value instanceof Uint8Array) {
        let hex = '';
        for (const byte of value)
            hex += byte.toString(16).padStart(2, '0');
        return hex;
    }
    if (typeof value === 'string')
        return value;
    throw new Error(`Field ${field} is not bytes-like: ${JSON.stringify(value)}`);
}
/** Require a field by its Soroban symbol rather than by declaration position. */
function required(payload, key) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        throw new Error(`missing field ${key}`);
    }
    return payload[key];
}
function versioned(payload, name) {
    const result = (0, codec_1.validateEventSchemaVersion)(payload, exports.EVENT_SCHEMA_VERSION);
    return 'reason' in result ? { type: 'unknown', name, reason: result.reason } : result.schemaVersion;
}
/**
 * Decode one contract event into a stable application-level type.
 *
 * Never throws for unrecognized or malformed events — an indexer consuming a
 * ledger stream must keep going, so anything undecodable becomes
 * `{ type: 'unknown', reason }` with the event name preserved when the topic
 * could be read.
 *
 * Time:  O(1) per event. Space: O(1).
 */
function decodeSorobanEvent(event) {
    let name;
    let payload;
    try {
        if (!event.topics || event.topics.length === 0) {
            return { type: 'unknown', reason: 'missing event topic' };
        }
        const topic = parseScVal(event.topics[0]);
        name = String((0, stellar_sdk_1.scValToNative)(topic));
        const raw = (0, stellar_sdk_1.scValToNative)(parseScVal(event.data));
        payload = (0, codec_1.decodeNamedEventPayload)(raw);
    }
    catch (e) {
        return { type: 'unknown', reason: `malformed event XDR: ${e.message}` };
    }
    try {
        switch (name) {
            case 'invoice_payment_recorded':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return { type: name, schemaVersion, invoiceId: String(required(payload, 'invoice_id')) };
                }
            case 'asset_allowlisted':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'asset_allowlisted',
                        schemaVersion,
                        code: String(required(payload, 'code')),
                        issuer: String(required(payload, 'issuer')),
                    };
                }
            case 'asset_revoked':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'asset_revoked',
                        schemaVersion,
                        code: String(required(payload, 'code')),
                        issuer: String(required(payload, 'issuer')),
                    };
                }
            case 'native_allow_changed':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'native_allow_changed',
                        schemaVersion,
                        allowed: Boolean(required(payload, 'allowed')),
                    };
                }
            case 'storage_schema_upgraded':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'storage_schema_upgraded',
                        schemaVersion,
                        fromVersion: Number(required(payload, 'from_version')),
                        toVersion: Number(required(payload, 'to_version')),
                        upgradedAt: toBigInt(required(payload, 'upgraded_at'), 'upgraded_at'),
                    };
                }
            case 'contract_paused':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'contract_paused',
                        schemaVersion,
                        paused: Boolean(required(payload, 'paused')),
                        triggeredBy: String(required(payload, 'triggered_by')),
                        timestamp: toBigInt(required(payload, 'timestamp'), 'timestamp'),
                    };
                }
            case 'admin_transfer_proposed':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'admin_transfer_proposed',
                        schemaVersion,
                        currentAdmin: String(required(payload, 'current_admin')),
                        newAdmin: String(required(payload, 'new_admin')),
                        timestamp: toBigInt(required(payload, 'timestamp'), 'timestamp'),
                    };
                }
            case 'admin_transfer_accepted':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'admin_transfer_accepted',
                        schemaVersion,
                        previousAdmin: String(required(payload, 'previous_admin')),
                        newAdmin: String(required(payload, 'new_admin')),
                        timestamp: toBigInt(required(payload, 'timestamp'), 'timestamp'),
                    };
                }
            case 'contract_upgraded':
                {
                    const schemaVersion = versioned(payload, name);
                    if (typeof schemaVersion !== 'number')
                        return schemaVersion;
                    return {
                        type: 'contract_upgraded',
                        schemaVersion,
                        previousVersion: Number(required(payload, 'previous_version')),
                        newVersion: Number(required(payload, 'new_version')),
                        newWasmHash: toHex(required(payload, 'new_wasm_hash'), 'new_wasm_hash'),
                        upgradedBy: String(required(payload, 'upgraded_by')),
                        upgradedAt: toBigInt(required(payload, 'upgraded_at'), 'upgraded_at'),
                    };
                }
            case 'admin_transfer_cancelled':
            case 'history_index_rebuilt':
            case 'settlement_refs_migrated':
            case 'allowlist_index_backfilled':
            case 'legacy_payments_migrated': {
                const schemaVersion = versioned(payload, name);
                if (typeof schemaVersion !== 'number')
                    return schemaVersion;
                const fields = { type: name, schemaVersion };
                const fieldNames = {
                    admin_transfer_cancelled: ['current_admin', 'cancelled_admin', 'timestamp'],
                    history_index_rebuilt: ['record_count', 'rebuilt_at'],
                    settlement_refs_migrated: ['count', 'conflicts_skipped', 'migrated_at'],
                    allowlist_index_backfilled: ['discovered', 'migrated_at'],
                    legacy_payments_migrated: ['migrated', 'migrated_at'],
                };
                for (const field of fieldNames[name]) {
                    fields[field] = required(payload, field);
                }
                for (const field of ['record_count', 'count', 'conflicts_skipped', 'discovered', 'migrated']) {
                    if (field in fields)
                        fields[field] = Number(fields[field]);
                }
                for (const field of ['timestamp', 'rebuilt_at', 'migrated_at']) {
                    if (field in fields)
                        fields[field] = toBigInt(fields[field], field);
                }
                for (const field of ['current_admin', 'cancelled_admin']) {
                    if (field in fields)
                        fields[field] = String(fields[field]);
                }
                return {
                    type: name,
                    schemaVersion,
                    ...Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'type' && key !== 'schemaVersion')),
                };
            }
            default:
                return { type: 'unknown', name, reason: 'unrecognized event name' };
        }
        return {
            type: 'unknown',
            name,
            reason: 'payload did not match the expected shape for this event',
        };
    }
    catch (e) {
        return { type: 'unknown', name, reason: `payload did not match expected shape: ${e.message}` };
    }
}
/**
 * Decode a batch of contract events, preserving input order.
 * Time: O(n). Space: O(n).
 */
function decodeEventStream(events) {
    return events.map(decodeSorobanEvent);
}
//# sourceMappingURL=events.js.map