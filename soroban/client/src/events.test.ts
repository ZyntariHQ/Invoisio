import { describe, expect, it } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

import {
  EVENT_SCHEMA_VERSION,
  decodeEventStream,
  decodeSorobanEvent,
  SorobanEventInput,
} from './events';

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
        nativeToScVal(G_PAYER, { type: 'address' }),
        nativeToScVal('USDC', { type: 'string' }),
        nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
        nativeToScVal(BigInt(12_500_000), { type: 'i128' }),
        nativeToScVal('settlement-abc-123', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: 1,
      invoiceId: 'INV-2049',
      payer: G_PAYER,
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount: BigInt(12_500_000),
      settlementRef: 'settlement-abc-123',
    });
  });

  it('rejects an invoice payment event from an unsupported schema version instead of guessing', () => {
    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: vecPayload(
        nativeToScVal(2, { type: 'u32' }),
        nativeToScVal('INV-1', { type: 'string' }),
        nativeToScVal(G_PAYER, { type: 'address' }),
        nativeToScVal('USDC', { type: 'string' }),
        nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
        nativeToScVal(BigInt(1), { type: 'i128' }),
        nativeToScVal('ref', { type: 'string' }),
      ),
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      name: 'invoice_payment_recorded',
      reason: 'unsupported schema version 2 (client supports 1)',
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

    const revoked = decodeSorobanEvent({
      topics: [topic('asset_revoked')],
      data: vecPayload(
        nativeToScVal('ARST', { type: 'string' }),
        nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
      ),
    });
    expect(revoked).toEqual({
      type: 'asset_revoked',
      code: 'ARST',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });
  });

  it('decodes native_allow_changed with its boolean payload', () => {
    const event: SorobanEventInput = {
      topics: [topic('native_allow_changed')],
      data: vecPayload(nativeToScVal(true)),
    };
    expect(decodeSorobanEvent(event)).toEqual({ type: 'native_allow_changed', allowed: true });
  });

  it('decodes storage_schema_upgraded with u32/u64 fields', () => {
    const event: SorobanEventInput = {
      topics: [topic('storage_schema_upgraded')],
      data: vecPayload(
        nativeToScVal(1, { type: 'u32' }),
        nativeToScVal(2, { type: 'u32' }),
        nativeToScVal(1_786_000_000, { type: 'u64' }),
      ),
    };
    expect(decodeSorobanEvent(event)).toEqual({
      type: 'storage_schema_upgraded',
      fromVersion: 1,
      toVersion: 2,
      upgradedAt: BigInt(1_786_000_000),
    });
  });

  it('decodes contract_paused (both pause and unpause use the same event)', () => {
    const decode = (paused: boolean) =>
      decodeSorobanEvent({
        topics: [topic('contract_paused')],
        data: vecPayload(
          nativeToScVal(paused),
          nativeToScVal(G_ADMIN, { type: 'address' }),
          nativeToScVal(1_786_000_001, { type: 'u64' }),
        ),
      });

    expect(decode(true)).toEqual({
      type: 'contract_paused',
      paused: true,
      triggeredBy: G_ADMIN,
      timestamp: BigInt(1_786_000_001),
    });
    expect(decode(false)).toMatchObject({ type: 'contract_paused', paused: false });
  });

  it('decodes admin_transfer_proposed and admin_transfer_accepted events', () => {
    const proposed = decodeSorobanEvent({
      topics: [topic('admin_transfer_proposed')],
      data: vecPayload(
        nativeToScVal(G_ADMIN, { type: 'address' }),
        nativeToScVal(G_PAYER, { type: 'address' }),
        nativeToScVal(1_786_000_100, { type: 'u64' }),
      ),
    });
    expect(proposed).toEqual({
      type: 'admin_transfer_proposed',
      currentAdmin: G_ADMIN,
      newAdmin: G_PAYER,
      timestamp: BigInt(1_786_000_100),
    });

    const accepted = decodeSorobanEvent({
      topics: [topic('admin_transfer_accepted')],
      data: vecPayload(
        nativeToScVal(G_ADMIN, { type: 'address' }),
        nativeToScVal(G_PAYER, { type: 'address' }),
        nativeToScVal(1_786_000_101, { type: 'u64' }),
      ),
    });
    expect(accepted).toEqual({
      type: 'admin_transfer_accepted',
      previousAdmin: G_ADMIN,
      newAdmin: G_PAYER,
      timestamp: BigInt(1_786_000_101),
    });
  });

  it('passes unknown event names through as unknown instead of throwing', () => {
    const event: SorobanEventInput = {
      topics: [topic('some_future_event')],
      data: vecPayload(nativeToScVal('x', { type: 'string' })),
    };
    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      name: 'some_future_event',
      reason: 'unrecognized event name',
    });
  });

  it('accepts the base64 XDR strings the RPC getEvents endpoint returns', () => {
    const event: SorobanEventInput = {
      topics: [topic('native_allow_changed').toXDR('base64')],
      data: vecPayload(nativeToScVal(false)).toXDR('base64'),
    };
    expect(decodeSorobanEvent(event)).toEqual({ type: 'native_allow_changed', allowed: false });
  });

  it('survives malformed XDR without throwing', () => {
    expect(decodeSorobanEvent({ topics: ['!!!not-base64!!!'], data: 'AAAA' })).toMatchObject({
      type: 'unknown',
    });
  });

  it('survives a known event with a payload of the wrong arity', () => {
    const event: SorobanEventInput = {
      topics: [topic('asset_allowlisted')],
      data: vecPayload(nativeToScVal('USDC', { type: 'string' })),
    };
    expect(decodeSorobanEvent(event)).toMatchObject({
      type: 'unknown',
      name: 'asset_allowlisted',
    });
  });

  it('decodes an invoice_payment_recorded event from a struct/object payload', () => {
    const structScVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: nativeToScVal('schema_version', { type: 'symbol' }), val: nativeToScVal(1, { type: 'u32' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('invoice_id', { type: 'symbol' }), val: nativeToScVal('INV-2049', { type: 'string' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('payer', { type: 'symbol' }), val: nativeToScVal(G_PAYER, { type: 'address' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('asset_code', { type: 'symbol' }), val: nativeToScVal('USDC', { type: 'string' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('asset_issuer', { type: 'symbol' }), val: nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('amount', { type: 'symbol' }), val: nativeToScVal(BigInt(12_500_000), { type: 'i128' }) }),
      new xdr.ScMapEntry({ key: nativeToScVal('settlement_ref', { type: 'symbol' }), val: nativeToScVal('settlement-abc-123', { type: 'string' }) }),
    ]);

    const event: SorobanEventInput = {
      topics: [topic('invoice_payment_recorded')],
      data: structScVal,
    };

    expect(decodeSorobanEvent(event)).toEqual({
      type: 'invoice_payment_recorded',
      schemaVersion: 1,
      invoiceId: 'INV-2049',
      payer: G_PAYER,
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount: BigInt(12_500_000),
      settlementRef: 'settlement-abc-123',
    });
  });

  it('handles missing or empty event topics gracefully without throwing', () => {
    const event: SorobanEventInput = {
      topics: [],
      data: vecPayload(nativeToScVal(true)),
    };
    expect(decodeSorobanEvent(event)).toEqual({
      type: 'unknown',
      reason: 'missing event topic',
    });
  });
});

describe('decodeEventStream', () => {
  it('decodes a mixed batch in order', () => {
    const events: SorobanEventInput[] = [
      {
        topics: [topic('native_allow_changed')],
        data: vecPayload(nativeToScVal(true)),
      },
      {
        topics: [topic('mystery_event')],
        data: vecPayload(nativeToScVal(1, { type: 'u32' })),
      },
      {
        topics: [topic('asset_revoked')],
        data: vecPayload(
          nativeToScVal('USDC', { type: 'string' }),
          nativeToScVal('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', { type: 'string' }),
        ),
      },
    ];

    const decoded = decodeEventStream(events);
    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toMatchObject({ type: 'native_allow_changed', allowed: true });
    expect(decoded[1]).toMatchObject({ type: 'unknown', name: 'mystery_event' });
    expect(decoded[2]).toMatchObject({ type: 'asset_revoked', code: 'USDC' });
  });
});
