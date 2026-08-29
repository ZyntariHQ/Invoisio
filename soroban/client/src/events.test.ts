import { describe, expect, it } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

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

  it('rejects an invoice payment event from an unsupported schema version instead of guessing', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: vecPayload(
        nativeToScVal(1, { type: 'u32' }),
        nativeToScVal('INV-1', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      name: 'invoice_payment_recorded',
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
