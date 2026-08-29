import { describe, expect, it } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

import { EVENT_SCHEMA_VERSION, decodeSorobanEvent, SorobanEventInput } from './events';

const ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const HASH = Uint8Array.from({ length: 32 }, (_, index) => index);

const topic = (name: string): xdr.ScVal => nativeToScVal(name, { type: 'symbol' });

function mapPayload(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(Object.entries(fields).map(([key, val]) =>
    new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val }),
  ));
}

function event(name: string, fields: Record<string, xdr.ScVal>): SorobanEventInput {
  return { topics: [topic(name)], data: mapPayload(fields) };
}

const G_PAYER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const G_ADMIN = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('decodeSorobanEvent', () => {
  it('decodes an invoice_payment_recorded event from a positional ScVec payload', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: mapPayload({
        schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
        invoice_id: nativeToScVal('INV-2049', { type: 'string' }),
      }),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: EVENT_SCHEMA_VERSION,
      invoiceId: 'INV-2049',
    });
  });

  it('rejects an invoice payment event from an unsupported schema version instead of guessing', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: mapPayload({
        schema_version: nativeToScVal(1, { type: 'u32' }),
        invoice_id: nativeToScVal('INV-1', { type: 'string' }),
      }),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      name: 'invoice_payment_recorded',
      reason: `unsupported schema version 1 (client supports ${EVENT_SCHEMA_VERSION})`,
    });
  });

  it('decodes named payloads and base64 XDR', () => {
    const decoded = decodeSorobanEvent({
      topics: [topic('invoice_payment_recorded').toXDR('base64')],
      data: mapPayload({
        invoice_id: nativeToScVal('INV-2049', { type: 'string' }),
        schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
      }).toXDR('base64'),
    });
    expect(decoded).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: EVENT_SCHEMA_VERSION,
      invoiceId: 'INV-2049',
    });
  });

  it('decodes versioned native_allow_changed payloads', () => {
    expect(decodeSorobanEvent({
      topics: [topic('native_allow_changed')],
      data: mapPayload({
        schema_version: nativeToScVal(EVENT_SCHEMA_VERSION, { type: 'u32' }),
        allowed: nativeToScVal(true, { type: 'bool' }),
      }),
    })).toEqual({
      type: 'native_allow_changed',
      schemaVersion: EVENT_SCHEMA_VERSION,
      allowed: true,
    });
  });

  it('rejects a reordered or truncated positional payload', () => {
    expect(decodeSorobanEvent({
      topics: [topic('native_allow_changed')],
      data: mapPayload({ allowed: nativeToScVal(true, { type: 'bool' }) }),
    })).toMatchObject({ type: 'unknown', name: 'native_allow_changed' });
  });
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
