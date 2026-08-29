import { describe, expect, it } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

import { EVENT_SCHEMA_VERSION, decodeSorobanEvent, SorobanEventInput } from './events';

const ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const HASH = Uint8Array.from({ length: 32 }, (_, index) => index);

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
