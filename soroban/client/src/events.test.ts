import { describe, expect, it } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

import { EVENT_SCHEMA_VERSION, decodeSorobanEvent, SorobanEventInput } from './events';

const ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const HASH = Uint8Array.from({ length: 32 }, (_, index) => index);
const topic = (name: string): xdr.ScVal => nativeToScVal(name, { type: 'symbol' });
const vecPayload = (...values: xdr.ScVal[]): xdr.ScVal => xdr.ScVal.scvVec(values);

function mapPayload(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(Object.entries(fields).map(([key, val]) =>
    new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val }),
  ));
}
function event(name: string, fields: Record<string, xdr.ScVal>): SorobanEventInput {
  return { topics: [topic(name)], data: mapPayload(fields) };
}

describe('decodeSorobanEvent', () => {
  it('decodes an invoice_payment_recorded event from a named payload', () => {
    expect(decodeSorobanEvent(event('invoice_payment_recorded', {
      schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
      invoice_id: nativeToScVal('INV-2049', { type: 'string' }),
    }))).toEqual({ type: 'invoice_payment_recorded', schemaVersion: EVENT_SCHEMA_VERSION, invoiceId: 'INV-2049' });
  });

  it('rejects an invoice payment event from an unsupported schema version', () => {
    expect(decodeSorobanEvent(event('invoice_payment_recorded', {
      schema_version: nativeToScVal(1, { type: 'u32' }),
      invoice_id: nativeToScVal('INV-1', { type: 'string' }),
    }))).toEqual({ type: 'unknown', name: 'invoice_payment_recorded', reason: `unsupported schema version 1 (client supports ${EVENT_SCHEMA_VERSION})` });
  });

  it('decodes named payloads and base64 XDR', () => {
    const decoded = decodeSorobanEvent({
      topics: [topic('invoice_payment_recorded').toXDR('base64')],
      data: mapPayload({
        invoice_id: nativeToScVal('INV-2049', { type: 'string' }),
        schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
      }).toXDR('base64'),
    });
    expect(decoded).toEqual({ type: 'invoice_payment_recorded', schemaVersion: EVENT_SCHEMA_VERSION, invoiceId: 'INV-2049' });
  });

  it('decodes versioned native_allow_changed payloads', () => {
    expect(decodeSorobanEvent(event('native_allow_changed', {
      schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
      allowed: nativeToScVal(true, { type: 'bool' }),
    }))).toEqual({ type: 'native_allow_changed', schemaVersion: EVENT_SCHEMA_VERSION, allowed: true });
  });

  it('rejects a positional payload', () => {
    expect(decodeSorobanEvent({ topics: [topic('native_allow_changed')], data: vecPayload(nativeToScVal(true, { type: 'bool' })) })).toMatchObject({ type: 'unknown', name: 'native_allow_changed' });
  });

  it('rejects malformed input and missing schema_version', () => {
    expect(decodeSorobanEvent({ topics: ['!!!not-base64!!!'], data: 'AAAA' })).toMatchObject({ type: 'unknown' });
    expect(decodeSorobanEvent(event('native_allow_changed', { allowed: nativeToScVal(true, { type: 'bool' }) }))).toEqual({ type: 'unknown', name: 'native_allow_changed', reason: `unsupported schema version NaN (client supports ${EVENT_SCHEMA_VERSION})` });
  });

  it('preserves unknown event names', () => {
    expect(decodeSorobanEvent(event('future_event', { schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }) }))).toEqual({ type: 'unknown', name: 'future_event', reason: 'unrecognized event name' });
  });

  it('decodes contract_upgraded payloads', () => {
    expect(decodeSorobanEvent(event('contract_upgraded', {
      schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
      previous_version: nativeToScVal(1, { type: 'u32' }),
      new_version: nativeToScVal(2, { type: 'u32' }),
      new_wasm_hash: nativeToScVal(HASH, { type: 'bytes' }),
      upgraded_by: nativeToScVal(ADMIN, { type: 'address' }),
      upgraded_at: nativeToScVal(100, { type: 'u64' }),
    }))).toMatchObject({ type: 'contract_upgraded', schemaVersion: EVENT_SCHEMA_VERSION });
  });
});
