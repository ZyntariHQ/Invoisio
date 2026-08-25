import { describe, expect, it } from 'vitest';

import {
  assertCanonicalIdentifier,
  isCanonicalIdentifier,
  MAX_INVOICE_ID_LEN,
  MAX_SETTLEMENT_REF_LEN,
} from './codec';

describe('isCanonicalIdentifier', () => {
  it('accepts lowercase letters, digits, and hyphens', () => {
    expect(isCanonicalIdentifier('invoisio-abc123', MAX_INVOICE_ID_LEN)).toBe(true);
    expect(isCanonicalIdentifier('a'.repeat(64), MAX_INVOICE_ID_LEN)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isCanonicalIdentifier('', MAX_INVOICE_ID_LEN)).toBe(false);
  });

  it('rejects a value over the length bound', () => {
    expect(isCanonicalIdentifier('a'.repeat(65), MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('a'.repeat(64), MAX_INVOICE_ID_LEN)).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(isCanonicalIdentifier('INV-001', MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('Inv-001', MAX_INVOICE_ID_LEN)).toBe(false);
  });

  it('rejects leading, trailing, and embedded whitespace', () => {
    expect(isCanonicalIdentifier(' inv-001', MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('inv-001 ', MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('inv 001', MAX_INVOICE_ID_LEN)).toBe(false);
  });

  it('rejects punctuation outside the canonical charset', () => {
    expect(isCanonicalIdentifier('inv_001', MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('inv.001', MAX_INVOICE_ID_LEN)).toBe(false);
    expect(isCanonicalIdentifier('inv+001', MAX_INVOICE_ID_LEN)).toBe(false);
  });

  it('applies the same rule to settlementRef with its own length bound', () => {
    expect(isCanonicalIdentifier('a'.repeat(128), MAX_SETTLEMENT_REF_LEN)).toBe(true);
    expect(isCanonicalIdentifier('a'.repeat(129), MAX_SETTLEMENT_REF_LEN)).toBe(false);
  });
});

describe('assertCanonicalIdentifier', () => {
  it('does not throw for a canonical value', () => {
    expect(() =>
      assertCanonicalIdentifier('invoisio-abc123', MAX_INVOICE_ID_LEN, 'invoiceId'),
    ).not.toThrow();
  });

  it('throws mentioning the field name for an empty value', () => {
    expect(() => assertCanonicalIdentifier('', MAX_INVOICE_ID_LEN, 'invoiceId')).toThrow(
      /invoiceId.*empty/,
    );
  });

  it('throws mentioning the field name for a value over the length bound', () => {
    expect(() =>
      assertCanonicalIdentifier('a'.repeat(129), MAX_SETTLEMENT_REF_LEN, 'settlementRef'),
    ).toThrow(/settlementRef.*128/);
  });

  it('throws mentioning the field name for a non-canonical value', () => {
    expect(() =>
      assertCanonicalIdentifier('Settle Ref!', MAX_SETTLEMENT_REF_LEN, 'settlementRef'),
    ).toThrow(/settlementRef/);
  });
});
