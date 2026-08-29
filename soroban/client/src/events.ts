import { scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  decodeNamedEventPayload,
  NamedEventPayload,
  validateEventSchemaVersion,
} from './codec';

/**
 * Schema version of the `invoice_payment_recorded` event payload that this
 * client knows how to decode. Mirrors `EVENT_SCHEMA_VERSION` in
 * `contracts/invoice-payment/src/events.rs` — bump both together when the
 * payload shape changes in a breaking way.
 */
export const EVENT_SCHEMA_VERSION = 2;

type VersionedEvent = { schemaVersion: number };

// ─── Decoded event types (discriminated on `type`) ──────────────────────────

/**
 * As of issue #512 this event carries only `schemaVersion` and `invoiceId` —
 * no payer, asset, amount, asset_decimals, or settlement_ref. A public event
 * carrying the full record previously bypassed every read-method
 * access-control decision in the contract; a consumer that needs the full
 * record must already know `invoiceId` and call `getPayment(invoiceId)`.
 *
 * Schema 1 (pre-#512) payloads are still decoded during the migration
 * window: they included `payer`, `assetCode`, `assetIssuer` (a raw string,
 * not an Address), `amount`, and `settlementRef`. Schema 2 is the compact
 * form. The issuer encoding change on stored records does not bump this
 * event further — issuer is no longer in the live payload.
 */
export type InvoicePaymentRecordedEvent = VersionedEvent & {
  type: 'invoice_payment_recorded';
  schemaVersion: number;
  invoiceId: string;
  /** Present only on schema 1 (pre-#512 full payload). */
  payer?: string;
  assetCode?: string;
  /** Present only on schema 1; unvalidated string issuer (may be empty for XLM). */
  assetIssuer?: string;
  amount?: bigint;
  settlementRef?: string;
};

export type AssetAllowlistedEvent = VersionedEvent & {
  type: 'asset_allowlisted';
  code: string;
  issuer: string;
};

export type AssetRevokedEvent = VersionedEvent & {
  type: 'asset_revoked';
  code: string;
  issuer: string;
};

export type NativeAllowChangedEvent = VersionedEvent & {
  type: 'native_allow_changed';
  allowed: boolean;
};

export type StorageSchemaUpgradedEvent = VersionedEvent & {
  type: 'storage_schema_upgraded';
  fromVersion: number;
  toVersion: number;
  upgradedAt: bigint;
};

export type ContractPausedEvent = VersionedEvent & {
  type: 'contract_paused';
  paused: boolean;
  triggeredBy: string;
  timestamp: bigint;
};

export type AdminTransferProposedEvent = VersionedEvent & {
  type: 'admin_transfer_proposed';
  currentAdmin: string;
  newAdmin: string;
  timestamp: bigint;
};

export type AdminTransferAcceptedEvent = VersionedEvent & {
  type: 'admin_transfer_accepted';
  previousAdmin: string;
  newAdmin: string;
  timestamp: bigint;
};

export type ContractUpgradedEvent = VersionedEvent & {
  type: 'contract_upgraded';
  /** Packed semver of the code that was running when `upgrade()` was called. */
  previousVersion: number;
  /**
   * Caller-supplied packed semver of the code being deployed. Not verified
   * on-chain against `newWasmHash` — see `upgrade()`'s doc comment in
   * `contracts/invoice-payment/src/lib.rs`.
   */
  newVersion: number;
  /** Hex-encoded 32-byte hash of the newly installed WASM. */
  newWasmHash: string;
  upgradedBy: string;
  upgradedAt: bigint;
};

export type UnknownSorobanEvent = {
  type: 'unknown';
  name?: string;
  reason: string;
};

export type DecodedSorobanEvent =
  | InvoicePaymentRecordedEvent
  | AssetAllowlistedEvent
  | AssetRevokedEvent
  | NativeAllowChangedEvent
  | StorageSchemaUpgradedEvent
  | ContractPausedEvent
  | AdminTransferProposedEvent
  | AdminTransferAcceptedEvent
  | ContractUpgradedEvent
  | UnknownSorobanEvent;

// ─── Raw event input ─────────────────────────────────────────────────────────

/**
 * Shape of a contract event as delivered by the Soroban RPC `getEvents`
 * endpoint (or `SorobanRpc.Server.getEvents`). `topics` and `data` are
 * accepted either as decoded `xdr.ScVal` values or as the base64 XDR strings
 * the RPC returns, so both raw API payloads and pre-parsed ones work.
 */
export type SorobanEventInput = {
  topics: Array<xdr.ScVal | string>;
  data: xdr.ScVal | string;
};

function parseScVal(value: xdr.ScVal | string): xdr.ScVal {
  return typeof value === 'string' ? xdr.ScVal.fromXDR(value, 'base64') : value;
}

function toBigInt(value: unknown, field: string): bigint {
  try {
    return BigInt(value as bigint | number | string);
  } catch {
    throw new Error(`Field ${field} is not integer-like: ${JSON.stringify(value)}`);
  }
}

/**
 * Decode a `BytesN<32>` field (e.g. a WASM hash) into a lowercase hex string.
 * `scValToNative` returns raw bytes for an `ScBytes` as a `Uint8Array`
 * (`Buffer` in Node, which extends it); a string is passed through as-is for
 * callers that already normalised the value upstream.
 */
function toHex(value: unknown, field: string): string {
  if (value instanceof Uint8Array) {
    let hex = '';
    for (const byte of value) hex += byte.toString(16).padStart(2, '0');
    return hex;
  }
  if (typeof value === 'string') return value;
  throw new Error(`Field ${field} is not bytes-like: ${JSON.stringify(value)}`);
}

/** Require a field by its Soroban symbol rather than by declaration position. */
function required(payload: NamedEventPayload, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    throw new Error(`missing field ${key}`);
  }
  return payload[key];
}

/**
 * Positional payloads carry no length information, so every decoder states
 * its arity up front: a vec with the wrong number of fields is a schema
 * mismatch, not a decoding error to paper over.
 */
function checkArity(payload: unknown[] | Record<string, unknown>, expected: number): boolean {
  return !Array.isArray(payload) || payload.length === expected;
}

function decodePaymentEvent(payload: unknown[] | Record<string, unknown>): DecodedSorobanEvent {
  const schemaVersion = Number(fieldAt(payload, 0, 'schema_version'));
  if (schemaVersion !== EVENT_SCHEMA_VERSION) {
    return {
      type: 'unknown',
      name: 'invoice_payment_recorded',
      reason: `unsupported schema version ${schemaVersion} (client supports ${EVENT_SCHEMA_VERSION})`,
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
export function decodeSorobanEvent(event: SorobanEventInput): DecodedSorobanEvent {
  let name: string | undefined;
  let payload: NamedEventPayload;

  try {
    if (!event.topics || event.topics.length === 0) {
      return { type: 'unknown', reason: 'missing event topic' };
    }
    const topic = parseScVal(event.topics[0]);
    name = String(scValToNative(topic));
    const raw = scValToNative(parseScVal(event.data));
    payload = decodeNamedEventPayload(raw);
  } catch (e) {
    return {
      type: 'unknown',
      ...(name ? { name } : {}),
      reason: `malformed event XDR: ${(e as Error).message}`,
    };
  }

  try {
    switch (name) {
      case 'invoice_payment_recorded':
        if (!checkArity(payload, 2)) break;
        return decodePaymentEvent(payload);
      case 'asset_allowlisted':
        {
          const schemaVersion = versioned(payload, name);
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
        return {
          type: 'native_allow_changed',
          schemaVersion,
          allowed: Boolean(required(payload, 'allowed')),
        };
        }
      case 'storage_schema_upgraded':
        {
          const schemaVersion = versioned(payload, name);
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
          if (typeof schemaVersion !== 'number') return schemaVersion;
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
  } catch (e) {
    return { type: 'unknown', name, reason: `payload did not match expected shape: ${(e as Error).message}` };
  }
}

/**
 * Decode a batch of contract events, preserving input order.
 * Time: O(n). Space: O(n).
 */
export function decodeEventStream(events: SorobanEventInput[]): DecodedSorobanEvent[] {
  return events.map(decodeSorobanEvent);
}
