import { describe, expect, it } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

import { EVENT_SCHEMA_VERSION, decodeSorobanEvent, SorobanEventInput } from './events';

const ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const HASH = Uint8Array.from({ length: 32 }, (_, index) => index);
/** `#[contractevent]` structs publish with the event name as the sole topic. */
const topic = (name: string): xdr.ScVal => nativeToScVal(name, { type: 'symbol' });

/** Positional payload: ScVec of field values in Rust declaration order. */
const vecPayload = (...values: xdr.ScVal[]): xdr.ScVal => xdr.ScVal.scvVec(values);

const G_PAYER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const G_ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('decodeSorobanEvent', () => {
  it('decodes an invoice_payment_recorded event from a positional ScVec payload', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: vecPayload(
        nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
        nativeToScVal('INV-2049', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: EVENT_SCHEMA_VERSION,
      invoiceId: 'INV-2049',
    });
  });

  it('decodes a schema 1 invoice_payment_recorded event (string issuer, full payload)', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: vecPayload(
        nativeToScVal(1, { type: 'u32' }),
        nativeToScVal('inv-1', { type: 'string' }),
        nativeToScVal(G_PAYER, { type: 'address' }),
        nativeToScVal('USDC', { type: 'string' }),
        nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
        nativeToScVal(50_000_000n, { type: 'i128' }),
        nativeToScVal('settle-usdc-1', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: 1,
      invoiceId: 'inv-1',
      payer: G_PAYER,
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount: 50_000_000n,
      settlementRef: 'settle-usdc-1',
    });
  });

  it('rejects an invoice payment event from an unsupported schema version instead of guessing', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: vecPayload(
        nativeToScVal(99, { type: 'u32' }),
        nativeToScVal('INV-1', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      name: 'invoice_payment_recorded',
      reason: `unsupported schema version 99 (client supports 1 and ${EVENT_SCHEMA_VERSION})`,
    });
  });

  it('decodes asset_allowlisted when the issuer is an Address ScVal', () => {
    const issuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const allowlisted = decodeSorobanEvent({
      topics: [topic('asset_allowlisted')],
      data: vecPayload(nativeToScVal('USDC', { type: 'string' }), new Address(issuer).toScVal()),
    });
    expect(allowlisted).toEqual({
      type: 'asset_allowlisted',
      code: 'USDC',
      issuer,
    });
  });

  it('decodes asset_allowlisted and asset_revoked events', () => {
    const allowlisted = decodeSorobanEvent({
      topics: [topic('asset_allowlisted')],
      data: vecPayload(
        nativeToScVal('USDC', { type: 'string' }),
        nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
      ),
    });
    expect(allowlisted).toEqual({
      type: 'asset_allowlisted',
      code: 'USDC',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });

const topic = (name: string): xdr.ScVal => nativeToScVal(name, { type: 'symbol' });

function mapPayload(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(fields).map(([key, val]) =>
      new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val }),
    ),
  );
}

function event(name: string, fields: Record<string, xdr.ScVal>): SorobanEventInput {
  return { topics: [topic(name)], data: mapPayload(fields) };
}

type EventCase = { name: string; fields: Record<string, xdr.ScVal> };

const version = () => nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' });
const time = () => nativeToScVal(100, { type: 'u64' });
const address = (value: string) => nativeToScVal(value, { type: 'address' });
const count = (value: number) => nativeToScVal(value, { type: 'u32' });

const cases: EventCase[] = [
  { name: 'invoice_payment_recorded', fields: { schema_version: version(), invoice_id: nativeToScVal('inv-1', { type: 'string' }) } },
  { name: 'asset_allowlisted', fields: { schema_version: version(), code: nativeToScVal('USDC', { type: 'string' }), issuer: nativeToScVal(ISSUER, { type: 'string' }) } },
  { name: 'asset_revoked', fields: { schema_version: version(), code: nativeToScVal('USDC', { type: 'string' }), issuer: nativeToScVal(ISSUER, { type: 'string' }) } },
  { name: 'native_allow_changed', fields: { schema_version: version(), allowed: nativeToScVal(true, { type: 'bool' }) } },
  { name: 'storage_schema_upgraded', fields: { schema_version: version(), from_version: count(1), to_version: count(2), upgraded_at: time() } },
  { name: 'contract_paused', fields: { schema_version: version(), paused: nativeToScVal(true, { type: 'bool' }), triggered_by: address(ADMIN), timestamp: time() } },
  { name: 'admin_transfer_proposed', fields: { schema_version: version(), current_admin: address(ADMIN), new_admin: address(ISSUER), timestamp: time() } },
  { name: 'admin_transfer_accepted', fields: { schema_version: version(), previous_admin: address(ADMIN), new_admin: address(ISSUER), timestamp: time() } },
  { name: 'admin_transfer_cancelled', fields: { schema_version: version(), current_admin: address(ADMIN), cancelled_admin: address(ISSUER), timestamp: time() } },
  { name: 'history_index_rebuilt', fields: { schema_version: version(), record_count: count(3), rebuilt_at: time() } },
  { name: 'settlement_refs_migrated', fields: { schema_version: version(), count: count(3), conflicts_skipped: count(1), migrated_at: time() } },
  { name: 'allowlist_index_backfilled', fields: { schema_version: version(), discovered: count(3), migrated_at: time() } },
  { name: 'legacy_payments_migrated', fields: { schema_version: version(), migrated: count(3), migrated_at: time() } },
  { name: 'contract_upgraded', fields: { schema_version: version(), previous_version: count(1), new_version: count(2), new_wasm_hash: nativeToScVal(HASH, { type: 'bytes' }), upgraded_by: address(ADMIN), upgraded_at: time() } },
];

describe('decodeSorobanEvent schema versioning', () => {
  for (const testCase of cases) {
    it(`decodes ${testCase.name} by field name`, () => {
      expect(decodeSorobanEvent(event(testCase.name, testCase.fields))).toMatchObject({
        type: testCase.name,
        schemaVersion: EVENT_SCHEMA_VERSION,
      });
    });

    it(`rejects an unsupported version for ${testCase.name}`, () => {
      const fields = { ...testCase.fields, schema_version: nativeToScVal(1, { type: 'u32' }) };
      expect(decodeSorobanEvent(event(testCase.name, fields))).toEqual({
        type: 'unknown',
        name: testCase.name,
        reason: `unsupported schema version 1 (client supports ${EVENT_SCHEMA_VERSION})`,
      });
    });

    it(`rejects a positional, reordered, or truncated payload for ${testCase.name}`, () => {
      const values = Object.values(testCase.fields);
      const malformed = values.length > 1 ? values.slice().reverse().slice(0, -1) : [];
      expect(decodeSorobanEvent({ topics: [topic(testCase.name)], data: xdr.ScVal.scvVec(malformed) })).toMatchObject({
        type: 'unknown',
        name: testCase.name,
      });
    });
  }
});

describe('decodeSorobanEvent malformed input', () => {
  it('rejects missing schema_version with the shared structured reason', () => {
    expect(decodeSorobanEvent(event('native_allow_changed', { allowed: nativeToScVal(true, { type: 'bool' }) }))).toEqual({
      type: 'unknown',
      name: 'native_allow_changed',
      reason: `unsupported schema version NaN (client supports ${EVENT_SCHEMA_VERSION})`,
    });
  });
});
