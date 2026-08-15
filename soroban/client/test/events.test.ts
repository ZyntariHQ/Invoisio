import { describe, expect, it } from 'bun:test';
import {
  decodeContractEvent,
  decodeInvoicePaymentRecordedEvent,
  decodeAssetAllowlistedEvent,
  decodeAssetRevokedEvent,
  decodeNativeAllowChangedEvent,
  decodeStorageSchemaUpgradedEvent,
  decodeContractPausedEvent,
} from '../src/index';

describe('Soroban Event Decoding Helpers (#298)', () => {
  it('decodes InvoicePaymentRecorded event from raw payload', () => {
    const raw = {
      schema_version: 1,
      invoice_id: 'inv_12345',
      payer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      asset_code: 'USDC',
      asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      amount: 50000000n,
      settlement_ref: 'tx_abc999',
    };

    const decoded = decodeInvoicePaymentRecordedEvent(raw);

    expect(decoded.type).toBe('invoice_payment_recorded');
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.invoiceId).toBe('inv_12345');
    expect(decoded.payer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(decoded.assetCode).toBe('USDC');
    expect(decoded.assetIssuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(decoded.amount).toBe(50000000n);
    expect(decoded.settlementRef).toBe('tx_abc999');
  });

  it('decodes AssetAllowlisted event', () => {
    const raw = {
      code: 'EURC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    };

    const decoded = decodeAssetAllowlistedEvent(raw);
    expect(decoded.type).toBe('asset_allowlisted');
    expect(decoded.code).toBe('EURC');
    expect(decoded.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });

  it('decodes AssetRevoked event', () => {
    const raw = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    };

    const decoded = decodeAssetRevokedEvent(raw);
    expect(decoded.type).toBe('asset_revoked');
    expect(decoded.code).toBe('USDC');
    expect(decoded.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });

  it('decodes NativeAllowChanged event', () => {
    const raw = { allowed: true };
    const decoded = decodeNativeAllowChangedEvent(raw);
    expect(decoded.type).toBe('native_allow_changed');
    expect(decoded.allowed).toBe(true);
  });

  it('decodes StorageSchemaUpgraded event', () => {
    const raw = {
      from_version: 1,
      to_version: 2,
      upgraded_at: 1718000000n,
    };
    const decoded = decodeStorageSchemaUpgradedEvent(raw);
    expect(decoded.type).toBe('storage_schema_upgraded');
    expect(decoded.fromVersion).toBe(1);
    expect(decoded.toVersion).toBe(2);
    expect(decoded.upgradedAt).toBe(1718000000n);
  });

  it('decodes ContractPaused event', () => {
    const raw = {
      paused: true,
      triggered_by: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      timestamp: 1718000000n,
    };
    const decoded = decodeContractPausedEvent(raw);
    expect(decoded.type).toBe('contract_paused');
    expect(decoded.paused).toBe(true);
    expect(decoded.triggeredBy).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(decoded.timestamp).toBe(1718000000n);
  });

  it('decodes events by topic using decodeContractEvent', () => {
    const event = {
      topic: ['InvoicePaymentRecorded'],
      data: {
        schema_version: 1,
        invoice_id: 'inv_888',
        payer: 'G_PAYER',
        asset_code: 'XLM',
        asset_issuer: '',
        amount: 10000000n,
        settlement_ref: 'ref_1',
      },
    };

    const decoded = decodeContractEvent(event);
    expect(decoded.type).toBe('invoice_payment_recorded');
    if (decoded.type === 'invoice_payment_recorded') {
      expect(decoded.invoiceId).toBe('inv_888');
      expect(decoded.amount).toBe(10000000n);
    }
  });
});
