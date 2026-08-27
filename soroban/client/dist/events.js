"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_SCHEMA_VERSION = void 0;
exports.decodeSorobanEvent = decodeSorobanEvent;
exports.decodeEventStream = decodeEventStream;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
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
/**
 * Field values arrive positionally: `#[contractevent]` structs publish as
 * `ScVec` with fields in declaration order, so decoders index by position.
 * An object form (named keys) is also accepted for forward-compatibility.
 */
function fieldAt(payload, index, key) {
    if (Array.isArray(payload))
        return payload[index];
    return payload[key];
}
/**
 * Positional payloads carry no length information, so every decoder states
 * its arity up front: a vec with the wrong number of fields is a schema
 * mismatch, not a decoding error to paper over.
 */
function checkArity(payload, expected) {
    return !Array.isArray(payload) || payload.length === expected;
}
function decodePaymentEvent(payload) {
    const schemaVersion = Number(fieldAt(payload, 0, 'schema_version'));
    if (schemaVersion !== exports.EVENT_SCHEMA_VERSION) {
        return {
            type: 'unknown',
            name: 'invoice_payment_recorded',
            reason: `unsupported schema version ${schemaVersion} (client supports ${exports.EVENT_SCHEMA_VERSION})`,
        };
    }
    return {
        type: 'invoice_payment_recorded',
        schemaVersion,
        invoiceId: String(fieldAt(payload, 1, 'invoice_id')),
    };
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
        if (!(Array.isArray(raw) || (raw !== null && typeof raw === 'object'))) {
            return { type: 'unknown', name, reason: 'event data is neither a struct nor a vec' };
        }
        payload = raw;
    }
    catch (e) {
        return { type: 'unknown', reason: `malformed event XDR: ${e.message}` };
    }
    try {
        switch (name) {
            case 'invoice_payment_recorded':
                if (!checkArity(payload, 2))
                    break;
                return decodePaymentEvent(payload);
            case 'asset_allowlisted':
                if (!checkArity(payload, 2))
                    break;
                return {
                    type: 'asset_allowlisted',
                    code: String(fieldAt(payload, 0, 'code')),
                    issuer: String(fieldAt(payload, 1, 'issuer')),
                };
            case 'asset_revoked':
                if (!checkArity(payload, 2))
                    break;
                return {
                    type: 'asset_revoked',
                    code: String(fieldAt(payload, 0, 'code')),
                    issuer: String(fieldAt(payload, 1, 'issuer')),
                };
            case 'native_allow_changed':
                if (!checkArity(payload, 1))
                    break;
                return {
                    type: 'native_allow_changed',
                    allowed: Boolean(fieldAt(payload, 0, 'allowed')),
                };
            case 'storage_schema_upgraded':
                if (!checkArity(payload, 3))
                    break;
                return {
                    type: 'storage_schema_upgraded',
                    fromVersion: Number(fieldAt(payload, 0, 'from_version')),
                    toVersion: Number(fieldAt(payload, 1, 'to_version')),
                    upgradedAt: toBigInt(fieldAt(payload, 2, 'upgraded_at'), 'upgraded_at'),
                };
            case 'contract_paused':
                if (!checkArity(payload, 3))
                    break;
                return {
                    type: 'contract_paused',
                    paused: Boolean(fieldAt(payload, 0, 'paused')),
                    triggeredBy: String(fieldAt(payload, 1, 'triggered_by')),
                    timestamp: toBigInt(fieldAt(payload, 2, 'timestamp'), 'timestamp'),
                };
            case 'admin_transfer_proposed':
                if (!checkArity(payload, 3))
                    break;
                return {
                    type: 'admin_transfer_proposed',
                    currentAdmin: String(fieldAt(payload, 0, 'current_admin')),
                    newAdmin: String(fieldAt(payload, 1, 'new_admin')),
                    timestamp: toBigInt(fieldAt(payload, 2, 'timestamp'), 'timestamp'),
                };
            case 'admin_transfer_accepted':
                if (!checkArity(payload, 3))
                    break;
                return {
                    type: 'admin_transfer_accepted',
                    previousAdmin: String(fieldAt(payload, 0, 'previous_admin')),
                    newAdmin: String(fieldAt(payload, 1, 'new_admin')),
                    timestamp: toBigInt(fieldAt(payload, 2, 'timestamp'), 'timestamp'),
                };
            case 'contract_upgraded':
                if (!checkArity(payload, 5))
                    break;
                return {
                    type: 'contract_upgraded',
                    previousVersion: Number(fieldAt(payload, 0, 'previous_version')),
                    newVersion: Number(fieldAt(payload, 1, 'new_version')),
                    newWasmHash: toHex(fieldAt(payload, 2, 'new_wasm_hash'), 'new_wasm_hash'),
                    upgradedBy: String(fieldAt(payload, 3, 'upgraded_by')),
                    upgradedAt: toBigInt(fieldAt(payload, 4, 'upgraded_at'), 'upgraded_at'),
                };
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