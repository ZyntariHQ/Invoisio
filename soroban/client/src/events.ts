import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { decodeNamedEventPayload, NamedEventPayload, validateEventSchemaVersion } from './codec';

export const EVENT_SCHEMA_VERSION = 2;
type VersionedEvent = { schemaVersion: number };
export type InvoicePaymentRecordedEvent = VersionedEvent & { type: 'invoice_payment_recorded'; invoiceId: string };
export type AssetAllowlistedEvent = VersionedEvent & { type: 'asset_allowlisted'; code: string; issuer: string };
export type AssetRevokedEvent = VersionedEvent & { type: 'asset_revoked'; code: string; issuer: string };
export type NativeAllowChangedEvent = VersionedEvent & { type: 'native_allow_changed'; allowed: boolean };
export type StorageSchemaUpgradedEvent = VersionedEvent & { type: 'storage_schema_upgraded'; fromVersion: number; toVersion: number; upgradedAt: bigint };
export type ContractPausedEvent = VersionedEvent & { type: 'contract_paused'; paused: boolean; triggeredBy: string; timestamp: bigint };
export type AdminTransferProposedEvent = VersionedEvent & { type: 'admin_transfer_proposed'; currentAdmin: string; newAdmin: string; timestamp: bigint };
export type AdminTransferAcceptedEvent = VersionedEvent & { type: 'admin_transfer_accepted'; previousAdmin: string; newAdmin: string; timestamp: bigint };
export type AdminTransferCancelledEvent = VersionedEvent & { type: 'admin_transfer_cancelled'; currentAdmin: string; cancelledAdmin: string; timestamp: bigint };
export type ContractUpgradedEvent = VersionedEvent & { type: 'contract_upgraded'; previousVersion: number; newVersion: number; newWasmHash: string; upgradedBy: string; upgradedAt: bigint };
export type HistoryIndexRebuiltEvent = VersionedEvent & { type: 'history_index_rebuilt'; recordCount: number; rebuiltAt: bigint };
export type SettlementRefsMigratedEvent = VersionedEvent & { type: 'settlement_refs_migrated'; count: number; conflictsSkipped: number; migratedAt: bigint };
export type AllowlistIndexBackfilledEvent = VersionedEvent & { type: 'allowlist_index_backfilled'; discovered: number; migratedAt: bigint };
export type LegacyPaymentsMigratedEvent = VersionedEvent & { type: 'legacy_payments_migrated'; migrated: number; migratedAt: bigint };
export type IssuersMigratedEvent = { type: 'issuers_migrated'; payments: number; allowlist: number; skippedMalformed: number; migratedAt: bigint };
export type UnknownSorobanEvent = { type: 'unknown'; name?: string; reason: string };
export type DecodedSorobanEvent = InvoicePaymentRecordedEvent | AssetAllowlistedEvent | AssetRevokedEvent | NativeAllowChangedEvent | StorageSchemaUpgradedEvent | ContractPausedEvent | AdminTransferProposedEvent | AdminTransferAcceptedEvent | AdminTransferCancelledEvent | ContractUpgradedEvent | HistoryIndexRebuiltEvent | SettlementRefsMigratedEvent | AllowlistIndexBackfilledEvent | LegacyPaymentsMigratedEvent | IssuersMigratedEvent | UnknownSorobanEvent;
export type SorobanEventInput = { topics: Array<xdr.ScVal | string>; data: xdr.ScVal | string };
type Payload = unknown[] | NamedEventPayload;

function parseScVal(value: xdr.ScVal | string): xdr.ScVal {
  return typeof value === 'string' ? xdr.ScVal.fromXDR(value, 'base64') : value;
}
function fieldAt(payload: Payload, index: number, key: string): unknown {
  return Array.isArray(payload) ? payload[index] : payload[key];
}
function arity(payload: Payload, expected: number): boolean {
  return !Array.isArray(payload) || payload.length === expected;
}
function integer(value: unknown, field: string): bigint {
  try { return BigInt(value as bigint | number | string); }
  catch { throw new Error(`Field ${field} is not integer-like: ${JSON.stringify(value)}`); }
}
function hex(value: unknown, field: string): string {
  if (value instanceof Uint8Array) return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (typeof value === 'string') return value;
  throw new Error(`Field ${field} is not bytes-like`);
}
function schemaVersion(payload: Payload, name: string): number | UnknownSorobanEvent {
  const result = Array.isArray(payload) ? { schemaVersion: Number(payload[0]) } : validateEventSchemaVersion(payload, EVENT_SCHEMA_VERSION);
  if ('reason' in result) return { type: 'unknown', name, reason: result.reason };
  if (result.schemaVersion !== EVENT_SCHEMA_VERSION) return { type: 'unknown', name, reason: `unsupported schema version ${result.schemaVersion} (client supports ${EVENT_SCHEMA_VERSION})` };
  return result.schemaVersion;
}
function unknown(name: string | undefined, reason: string): UnknownSorobanEvent {
  return { type: 'unknown', ...(name ? { name } : {}), reason };
}

export function decodeSorobanEvent(event: SorobanEventInput): DecodedSorobanEvent {
  let name: string | undefined;
  let payload: Payload;
  try {
    if (!event.topics?.length) return unknown(undefined, 'missing event topic');
    name = String(scValToNative(parseScVal(event.topics[0])));
    payload = decodeNamedEventPayload(scValToNative(parseScVal(event.data))) as Payload;
  } catch (error) {
    return unknown(name, `malformed event XDR: ${(error as Error).message}`);
  }
  try {
    switch (name) {
      case 'invoice_payment_recorded': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 2)) break;
        return { type: name, schemaVersion: versioned, invoiceId: String(fieldAt(payload, 1, 'invoice_id')) };
      }
      case 'asset_allowlisted':
      case 'asset_revoked': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 3)) break;
        return { type: name, schemaVersion: versioned, code: String(fieldAt(payload, 1, 'code')), issuer: String(fieldAt(payload, 2, 'issuer')) };
      }
      case 'native_allow_changed': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 2)) break;
        return { type: name, schemaVersion: versioned, allowed: Boolean(fieldAt(payload, 1, 'allowed')) };
      }
      case 'storage_schema_upgraded': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, fromVersion: Number(fieldAt(payload, 1, 'from_version')), toVersion: Number(fieldAt(payload, 2, 'to_version')), upgradedAt: integer(fieldAt(payload, 3, 'upgraded_at'), 'upgraded_at') };
      }
      case 'contract_paused': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, paused: Boolean(fieldAt(payload, 1, 'paused')), triggeredBy: String(fieldAt(payload, 2, 'triggered_by')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
      }
      case 'admin_transfer_proposed': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, currentAdmin: String(fieldAt(payload, 1, 'current_admin')), newAdmin: String(fieldAt(payload, 2, 'new_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
      }
      case 'admin_transfer_accepted': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, previousAdmin: String(fieldAt(payload, 1, 'previous_admin')), newAdmin: String(fieldAt(payload, 2, 'new_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
      }
      case 'admin_transfer_cancelled': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, currentAdmin: String(fieldAt(payload, 1, 'current_admin')), cancelledAdmin: String(fieldAt(payload, 2, 'cancelled_admin')), timestamp: integer(fieldAt(payload, 3, 'timestamp'), 'timestamp') };
      }
      case 'contract_upgraded': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 6)) break;
        return { type: name, schemaVersion: versioned, previousVersion: Number(fieldAt(payload, 1, 'previous_version')), newVersion: Number(fieldAt(payload, 2, 'new_version')), newWasmHash: hex(fieldAt(payload, 3, 'new_wasm_hash'), 'new_wasm_hash'), upgradedBy: String(fieldAt(payload, 4, 'upgraded_by')), upgradedAt: integer(fieldAt(payload, 5, 'upgraded_at'), 'upgraded_at') };
      }
      case 'history_index_rebuilt': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 3)) break;
        return { type: name, schemaVersion: versioned, recordCount: Number(fieldAt(payload, 1, 'record_count')), rebuiltAt: integer(fieldAt(payload, 2, 'rebuilt_at'), 'rebuilt_at') };
      }
      case 'settlement_refs_migrated': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 4)) break;
        return { type: name, schemaVersion: versioned, count: Number(fieldAt(payload, 1, 'count')), conflictsSkipped: Number(fieldAt(payload, 2, 'conflicts_skipped')), migratedAt: integer(fieldAt(payload, 3, 'migrated_at'), 'migrated_at') };
      }
      case 'allowlist_index_backfilled': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 3)) break;
        return { type: name, schemaVersion: versioned, discovered: Number(fieldAt(payload, 1, 'discovered')), migratedAt: integer(fieldAt(payload, 2, 'migrated_at'), 'migrated_at') };
      }
      case 'legacy_payments_migrated': {
        const versioned = schemaVersion(payload, name);
        if (typeof versioned !== 'number') return versioned;
        if (!arity(payload, 3)) break;
        return { type: name, schemaVersion: versioned, migrated: Number(fieldAt(payload, 1, 'migrated')), migratedAt: integer(fieldAt(payload, 2, 'migrated_at'), 'migrated_at') };
      }
      case 'issuers_migrated':
        if (!arity(payload, 4)) break;
        return { type: name, payments: Number(fieldAt(payload, 0, 'payments')), allowlist: Number(fieldAt(payload, 1, 'allowlist')), skippedMalformed: Number(fieldAt(payload, 2, 'skipped_malformed')), migratedAt: integer(fieldAt(payload, 3, 'migrated_at'), 'migrated_at') };
      default:
        return unknown(name, 'unrecognized event name');
    }
    return unknown(name, 'payload did not match the expected shape for this event');
  } catch (error) {
    return unknown(name, `payload did not match expected shape: ${(error as Error).message}`);
  }
}

export function decodeEventStream(events: SorobanEventInput[]): DecodedSorobanEvent[] {
  return events.map(decodeSorobanEvent);
}
