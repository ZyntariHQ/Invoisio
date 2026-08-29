"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_SCHEMA_VERSION = void 0;
exports.decodeSorobanEvent = decodeSorobanEvent;
exports.decodeEventStream = decodeEventStream;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const codec_1 = require("./codec");
exports.EVENT_SCHEMA_VERSION = 2;
function parseScVal(value) {
    return typeof value === 'string' ? stellar_sdk_1.xdr.ScVal.fromXDR(value, 'base64') : value;
}
function fieldAt(payload, index, key) {
    return Array.isArray(payload) ? payload[index] : payload[key];
}
function arity(payload, expected) {
    return !Array.isArray(payload) || payload.length === expected;
}
function integer(value, field) {
    try {
        return BigInt(value);
    }
    catch {
        throw new Error(`Field ${field} is not integer-like: ${JSON.stringify(value)}`);
    }
}
function hex(value, field) {
    if (value instanceof Uint8Array)
        return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (typeof value === 'string')
        return value;
    throw new Error(`Field ${field} is not bytes-like`);
}
function schemaVersion(payload, name) {
    const result = Array.isArray(payload) ? { schemaVersion: Number(payload[0]) } : (0, codec_1.validateEventSchemaVersion)(payload, exports.EVENT_SCHEMA_VERSION);
    if ('reason' in result)
        return { type: 'unknown', name, reason: result.reason };
    if (result.schemaVersion !== exports.EVENT_SCHEMA_VERSION)
        return { type: 'unknown', name, reason: `unsupported schema version ${result.schemaVersion} (client supports ${exports.EVENT_SCHEMA_VERSION})` };
    return result.schemaVersion;
}
function unknown(name, reason) {
    return { type: 'unknown', ...(name ? { name } : {}), reason };
}
function decodeSorobanEvent(event) {
    let name;
    let payload;
    try {
        if (!event.topics?.length)
            return unknown(undefined, 'missing event topic');
        name = String((0, stellar_sdk_1.scValToNative)(parseScVal(event.topics[0])));
        payload = (0, codec_1.decodeNamedEventPayload)((0, stellar_sdk_1.scValToNative)(parseScVal(event.data)));
    }
    catch (error) {
        return unknown(name, `malformed event XDR: ${error.message}`);
    }
    try {
        switch (name) {
            case 'invoice_payment_recorded':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 2))
                        break;
                    return { type: name, schemaVersion: versioned, invoiceId: String(fieldAt(payload, 1, 'invoice_id')) };
                }
            case 'asset_allowlisted':
            case 'asset_revoked':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 3))
                        break;
                    return { type: name, schemaVersion: versioned, code: String(fieldAt(payload, 1, 'code')), issuer: String(fieldAt(payload, 2, 'issuer')) };
                }
            case 'native_allow_changed':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 2))
                        break;
                    return { type: name, schemaVersion: versioned, allowed: Boolean(fieldAt(payload, 1, 'allowed')) };
                }
            case 'storage_schema_upgraded':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, fromVersion: Number(fieldAt(payload, 1, 'from_version')), toVersion: Number(fieldAt(payload, 2, 'to_version')), upgradedAt: integer(fieldAt(payload, 3, 'upgraded_at'), 'upgraded_at') };
                }
            case 'contract_paused':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, paused: Boolean(fieldAt(payload, 1, 'paused')), triggeredBy: String(fieldAt(payload, 2, 'triggered_by')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
                }
            case 'admin_transfer_proposed':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, currentAdmin: String(fieldAt(payload, 1, 'current_admin')), newAdmin: String(fieldAt(payload, 2, 'new_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
                }
            case 'admin_transfer_accepted':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, previousAdmin: String(fieldAt(payload, 1, 'previous_admin')), newAdmin: String(fieldAt(payload, 2, 'new_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
                }
            case 'admin_transfer_cancelled':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, currentAdmin: String(fieldAt(payload, 1, 'current_admin')), cancelledAdmin: String(fieldAt(payload, 2, 'cancelled_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
                }
            case 'contract_upgraded':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 6))
                        break;
                    return { type: name, schemaVersion: versioned, previousVersion: Number(fieldAt(payload, 1, 'previous_version')), newVersion: Number(fieldAt(payload, 2, 'new_version')), newWasmHash: hex(fieldAt(payload, 3, 'new_wasm_hash'), 'new_wasm_hash'), upgradedBy: String(fieldAt(payload, 4, 'upgraded_by')), upgradedAt: integer(fieldAt(payload, 5, 'upgraded_at'), 'upgraded_at') };
                }
            case 'history_index_rebuilt':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 3))
                        break;
                    return { type: name, schemaVersion: versioned, recordCount: Number(fieldAt(payload, 1, 'record_count')), rebuiltAt: integer(fieldAt(payload, 2, 'rebuilt_at'), 'rebuilt_at') };
                }
            case 'settlement_refs_migrated':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 4))
                        break;
                    return { type: name, schemaVersion: versioned, count: Number(fieldAt(payload, 1, 'count')), conflictsSkipped: Number(fieldAt(payload, 2, 'conflicts_skipped')), migratedAt: integer(fieldAt(payload, 3, 'migrated_at'), 'migrated_at') };
                }
            case 'allowlist_index_backfilled':
                {
                    const versioned = schemaVersion(payload, name);
                    if (typeof versioned !== 'number')
                        return versioned;
                    if (!arity(payload, 3))
                        break;
                    return { type: name, schemaVersion: versioned, discovered: Number(fieldAt(payload, 1, 'discovered')), migratedAt: integer(fieldAt(payload, 2, 'migrated_at'), 'migrated_at') };
                }
            default:
                return unknown(name, 'unrecognized event name');
        }
        return unknown(name, 'payload did not match the expected shape for this event');
    }
    catch (error) {
        return unknown(name, `payload did not match expected shape: ${error.message}`);
    }
}
function decodeEventStream(events) {
    return events.map(decodeSorobanEvent);
}
//# sourceMappingURL=events.js.map