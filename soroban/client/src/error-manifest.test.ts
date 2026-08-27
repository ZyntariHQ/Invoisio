import { describe, expect, it } from 'vitest';

import { parseContractError } from './codec';
import {
  CONTRACT_ERROR_CODES,
  CONTRACT_ERROR_MANIFEST,
  getContractError,
  getContractErrorCode,
  SorobanContractError,
} from './types';

/**
 * The contract (`soroban/contracts/invoice-payment/src/errors.rs`) is the
 * source of truth. These expectations must be updated in lockstep with the
 * Rust `ContractError` enum — see the "Evolving the manifest" section of
 * `src/error-manifest.ts`.
 */
const EXPECTED_CONTRACT_ERRORS = [
  { code: 1, name: 'AlreadyInitialized' },
  { code: 2, name: 'NotInitialized' },
  { code: 3, name: 'PaymentAlreadyRecorded' },
  { code: 4, name: 'PaymentNotFound' },
  { code: 5, name: 'InvalidAmount' },
  { code: 6, name: 'InvalidInvoiceId' },
  { code: 7, name: 'InvalidAsset' },
  { code: 8, name: 'AssetNotAllowed' },
  { code: 9, name: 'Unauthorized' },
  { code: 10, name: 'StorageSchemaTooNew' },
  { code: 11, name: 'StorageSchemaTooOld' },
  { code: 12, name: 'ContractPaused' },
  { code: 13, name: 'InvalidSettlementRef' },
  { code: 14, name: 'NoPendingAdmin' },
  { code: 15, name: 'PendingAdminExists' },
  { code: 16, name: 'InvalidProposedAdmin' },
  { code: 17, name: 'HistoryIndexRebuildFailed' },
  { code: 18, name: 'MigrationRequired' },
  { code: 19, name: 'HistoryIndexIncomplete' },
  { code: 20, name: 'SettlementRefAlreadyUsed' },
] as const;

describe('CONTRACT_ERROR_MANIFEST', () => {
  it('covers every error the contract can raise, in ascending ABI order', () => {
    expect(CONTRACT_ERROR_MANIFEST.map(({ code, name }) => ({ code, name }))).toEqual(
      EXPECTED_CONTRACT_ERRORS,
    );
  });

  it('uses unique, sequential codes starting at 1 so the ABI stays unambiguous', () => {
    const codes = CONTRACT_ERROR_MANIFEST.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    expect(Math.min(...codes)).toBe(1);
  });

  it('gives every entry a non-empty meaning so consumers have a typed reference', () => {
    for (const entry of CONTRACT_ERROR_MANIFEST) {
      expect(entry.meaning.length, `meaning missing for code ${entry.code}`).toBeGreaterThan(0);
    }
  });

  it('derives CONTRACT_ERROR_CODES from the manifest', () => {
    const expected = Object.fromEntries(
      CONTRACT_ERROR_MANIFEST.map((entry) => [entry.code, entry.name]),
    );
    expect(CONTRACT_ERROR_CODES).toEqual(expected);
  });

  it('resolves names both via the map and the lookup helper', () => {
    for (const { code, name } of EXPECTED_CONTRACT_ERRORS) {
      expect(CONTRACT_ERROR_CODES[code]).toBe(name);
      expect(getContractErrorCode(code)).toBe(name);
      expect(getContractError(code)?.name).toBe(name);
    }
  });

  it('returns Unknown for unmapped codes', () => {
    expect(getContractErrorCode(0)).toBe('Unknown');
    expect(getContractErrorCode(999)).toBe('Unknown');
    expect(getContractError(999)).toBeUndefined();
  });
});

describe('parseContractError', () => {
  it('maps every contract failure string to its typed error (SDK v14 format)', () => {
    for (const { code, name } of EXPECTED_CONTRACT_ERRORS) {
      const err = parseContractError(`host error: Error(Contract, #${code})`);
      expect(err).toBeInstanceOf(SorobanContractError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('SorobanContractError');
      expect(err.code).toBe(name);
      expect(err.numericCode).toBe(code);
      expect(err.message).toContain(name);
      expect(err.message).toContain(`code=${code}`);
    }
  });

  it('maps every contract failure string to its typed error (legacy format)', () => {
    for (const { code, name } of EXPECTED_CONTRACT_ERRORS) {
      const err = parseContractError(`simulation failed: contractError(${code})`);
      expect(err.code).toBe(name);
      expect(err.numericCode).toBe(code);
    }
  });

  it('surfaces an unknown numeric code as Unknown while preserving the code', () => {
    const err = parseContractError('Error(Contract, #42)');
    expect(err.code).toBe('Unknown');
    expect(err.numericCode).toBe(42);
  });

  it('returns Unknown (-1) for strings that are not contract errors', () => {
    for (const input of ['', 'transaction failed', 'Error(Host, #5)', 'contractError(abc)']) {
      const err = parseContractError(input);
      expect(err.code, `input: ${input}`).toBe('Unknown');
      expect(err.numericCode, `input: ${input}`).toBe(-1);
    }
  });

  it('prefers the SDK v14 group over the legacy group when both match', () => {
    const err = parseContractError('Error(Contract, #4) contractError(3)');
    expect(err.code).toBe('PaymentNotFound');
    expect(err.numericCode).toBe(4);
  });
});

describe('representative contract failure scenarios', () => {
  it('maps a paused-write rejection to ContractPaused', () => {
    const err = parseContractError(
      'simulation failed: HostError: Error(Contract, #12)',
    );
    expect(err.code).toBe('ContractPaused');
    expect(err.numericCode).toBe(12);
    expect(getContractError(12)?.name).toBe('ContractPaused');
    expect(getContractError(12)?.meaning).toContain('paused');
  });

  it('maps an upgrade_storage() mismatch to the matching storage-schema code', () => {
    const tooNew = parseContractError(
      'simulation failed: upgrade_storage: Error(Contract, #10)',
    );
    expect(tooNew.code).toBe('StorageSchemaTooNew');
    expect(tooNew.numericCode).toBe(10);
    expect(getContractError(10)?.meaning).toContain('storage_schema_version');

    const tooOld = parseContractError(
      'simulation failed: upgrade_storage: Error(Contract, #11)',
    );
    expect(tooOld.code).toBe('StorageSchemaTooOld');
    expect(tooOld.numericCode).toBe(11);
  });

  it('maps an invalid settlement reference on record_payment() to InvalidSettlementRef', () => {
    const err = parseContractError(
      'simulation failed: record_payment: Error(Contract, #13)',
    );
    expect(err.code).toBe('InvalidSettlementRef');
    expect(err.numericCode).toBe(13);
    expect(getContractError(13)?.name).toBe('InvalidSettlementRef');
  });

  it('maps a rebuild_history_index() failure on a stale schema to MigrationRequired', () => {
    const err = parseContractError(
      'simulation failed: rebuild_history_index: Error(Contract, #18)',
    );
    expect(err.code).toBe('MigrationRequired');
    expect(err.numericCode).toBe(18);
    expect(getContractError(18)?.meaning).toContain('upgrade_storage()');
  });

  it('maps history-index maintenance failures to their typed codes', () => {
    const rebuildFailed = parseContractError('Error(Contract, #17)');
    expect(rebuildFailed.code).toBe('HistoryIndexRebuildFailed');
    expect(rebuildFailed.numericCode).toBe(17);

    const incomplete = parseContractError('Error(Contract, #19)');
    expect(incomplete.code).toBe('HistoryIndexIncomplete');
    expect(incomplete.numericCode).toBe(19);
  });

  it('maps a duplicate settlement reference on record_payment() to SettlementRefAlreadyUsed', () => {
    const err = parseContractError(
      'simulation failed: record_payment: Error(Contract, #20)',
    );
    expect(err.code).toBe('SettlementRefAlreadyUsed');
    expect(err.numericCode).toBe(20);
    expect(getContractError(20)?.meaning).toContain('globally unique');
  });

  it('falls back cleanly, without throwing, for a code the manifest does not know yet', () => {
    expect(() => parseContractError('Error(Contract, #99)')).not.toThrow();
    const err = parseContractError('Error(Contract, #99)');
    expect(err.code).toBe('Unknown');
    expect(err.numericCode).toBe(99);
    expect(getContractError(99)).toBeUndefined();
  });
});
