import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Account,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  SorobanDataBuilder,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';

import { SorobanInvoiceClient } from './soroban-invoice-client';
import { SorobanContractError } from './types';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const CONTRACT_ID = 'CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2';
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const READER = Keypair.random().publicKey();
const TX_HASH = 'a'.repeat(64);
const LEDGER = 12_345;

const signer = Keypair.random();
const SIGNER_PUBLIC = signer.publicKey();

/** Build a read-only client, or a write-capable client when a secret is given. */
function makeClient(secretKey?: string): SorobanInvoiceClient {
  return new SorobanInvoiceClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contractId: CONTRACT_ID,
    signerSecretKey: secretKey,
    sourcePublicKey: READER,
  });
}

/**
 * Extract the contract method name and its native-decoded arguments from the
 * single `invokeHostFunction` operation carried by a transaction.
 */
function decodeInvocation(tx: Transaction): { method: string; args: unknown[] } {
  const op = tx.operations[0];
  if (op.type !== 'invokeHostFunction') {
    throw new Error(`expected invokeHostFunction operation, got ${op.type}`);
  }
  const invoke = op.func.invokeContract();
  return {
    method: String(invoke.functionName()),
    args: invoke.args().map((arg: xdr.ScVal): unknown => scValToNative(arg)),
  };
}

/** A minimal, well-typed successful simulation response carrying `retval`. */
function simulateSuccess(retval: xdr.ScVal): rpc.Api.SimulateTransactionResponse {
  return {
    id: 'sim-1',
    latestLedger: LEDGER,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '100',
    result: { auth: [], retval },
  };
}

/** A successful getTransaction response assembled from the signed transaction. */
function getTransactionSuccess(
  tx: Transaction,
  ledger: number,
): rpc.Api.GetSuccessfulTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    ledger,
    txHash: tx.hash().toString('hex'),
    latestLedger: ledger,
    latestLedgerCloseTime: 0,
    oldestLedger: 0,
    oldestLedgerCloseTime: 0,
    createdAt: 0,
    applicationOrder: 0,
    feeBump: false,
    envelopeXdr: tx.toEnvelope(),
    resultXdr: new xdr.TransactionResult({
      feeCharged: new xdr.Int64(0),
      result: xdr.TransactionResultResult.txSuccess([]),
      ext: new xdr.TransactionResultExt(0),
    }),
    resultMetaXdr: new xdr.TransactionMeta(0, []),
    events: { transactionEventsXdr: [], contractEventsXdr: [] },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pause-state methods', () => {
  it('setPaused() submits set_paused(caller, paused) and returns the tx result', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const client = makeClient(signer.secret());
    const result = await client.setPaused(true);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(prepared).toBeDefined();
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'set_paused',
      args: [SIGNER_PUBLIC, true],
    });
  });

  it('isPaused() calls is_paused and decodes the boolean', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(nativeToScVal(true));
      },
    );

    await expect(makeClient().isPaused()).resolves.toBe(true);
    expect(simulated).toBeDefined();
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'is_paused',
      args: [],
    });
  });
});

describe('allowlist operations', () => {
  it('allowAsset() submits allow_asset(code, issuer)', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const result = await makeClient(signer.secret()).allowAsset('USDC', ISSUER);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'allow_asset',
      args: ['USDC', ISSUER],
    });
  });

  it('revokeAsset() submits revoke_asset(code, issuer)', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const result = await makeClient(signer.secret()).revokeAsset('USDC', ISSUER);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'revoke_asset',
      args: ['USDC', ISSUER],
    });
  });

  it('setAllowNative() submits set_allow_native(allowed)', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const result = await makeClient(signer.secret()).setAllowNative(true);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'set_allow_native',
      args: [true],
    });
  });
});

describe('recordPayment', () => {
  it('recordPayment() submits record_payment with an Asset enum (Native for empty issuer)', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const amount = 10_000_000n;
    const result = await makeClient(signer.secret()).recordPayment({
      invoiceId: 'invoisio-abc123',
      payer: READER,
      assetCode: 'XLM',
      assetIssuer: '',
      amount,
      settlementRef: 'settle-hash-abc123',
    });

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'record_payment',
      args: ['invoisio-abc123', READER, ['Native'], amount, 'settle-hash-abc123'],
    });
  });

  it('recordPayment() encodes a token as Asset::Token(code, Address)', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(
      async (tx) => {
        prepared = tx as Transaction;
        return {
          status: 'PENDING',
          hash: TX_HASH,
          latestLedger: LEDGER,
          latestLedgerCloseTime: 0,
        };
      },
    );
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(
      async () => getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    await makeClient(signer.secret()).recordPayment({
      invoiceId: 'invoisio-usdc-1',
      payer: READER,
      assetCode: 'USDC',
      assetIssuer: ISSUER,
      amount: 50_000_000n,
      settlementRef: 'settle-usdc-1',
    });

    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'record_payment',
      args: ['invoisio-usdc-1', READER, ['Token', 'USDC', ISSUER], 50_000_000n, 'settle-usdc-1'],
    });
  });

  it('recordPayment() rejects a malformed issuer before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'invoisio-bad-issuer',
        payer: READER,
        assetCode: 'USDC',
        assetIssuer: 'not-an-address',
        amount: 1n,
        settlementRef: 'settle-bad-issuer',
      }),
    ).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled();
  });

  it('recordPayment() rejects a non-canonical invoiceId before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'INVOISIO-ABC123',
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: 'settle-hash-abc123',
      }),
    ).rejects.toThrow(/invoiceId/);

    expect(submit).not.toHaveBeenCalled();
  });

  it('recordPayment() rejects an invoiceId over MAX_INVOICE_ID_LEN before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'a'.repeat(65),
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: 'settle-hash-abc123',
      }),
    ).rejects.toThrow(/invoiceId/);

    expect(submit).not.toHaveBeenCalled();
  });

  it('recordPayment() rejects a non-canonical settlementRef before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'invoisio-abc123',
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: 'settle hash abc123',
      }),
    ).rejects.toThrow(/settlementRef/);

    expect(submit).not.toHaveBeenCalled();
  });

  it('recordPayment() rejects a settlementRef over MAX_SETTLEMENT_REF_LEN before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'invoisio-abc123',
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: 'a'.repeat(129),
      }),
    ).rejects.toThrow(/settlementRef/);

    expect(submit).not.toHaveBeenCalled();
  });

  it('recordPayment() rejects an empty invoiceId or settlementRef before submitting', async () => {
    const submit = vi.spyOn(rpc.Server.prototype, 'prepareTransaction');

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: '',
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: 'settle-hash-abc123',
      }),
    ).rejects.toThrow(/invoiceId/);

    await expect(
      makeClient(signer.secret()).recordPayment({
        invoiceId: 'invoisio-abc123',
        payer: READER,
        assetCode: 'XLM',
        assetIssuer: '',
        amount: 10_000_000n,
        settlementRef: '',
      }),
    ).rejects.toThrow(/settlementRef/);

    expect(submit).not.toHaveBeenCalled();
  });
});

describe('admin read method', () => {
  it('getAdmin() calls admin and decodes the admin address', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(nativeToScVal(SIGNER_PUBLIC, { type: 'address' }));
      },
    );

    await expect(makeClient().getAdmin()).resolves.toBe(SIGNER_PUBLIC);
    expect(simulated).toBeDefined();
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'admin',
      args: [],
    });
  });

  it('getAdmin() surfaces a NotInitialized contract error', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      id: 'sim-err',
      latestLedger: LEDGER,
      events: [],
      _parsed: true,
      error: 'host error: Error(Contract, #2)',
    });

    const err = await makeClient().getAdmin().catch((e) => e);
    expect(err).toBeInstanceOf(SorobanContractError);
    expect((err as SorobanContractError).code).toBe('NotInitialized');
  });
});

describe('getPayment', () => {
  it('getPayment() decodes settlementRef from the stored PaymentRecord', async () => {
    const paymentRecord = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('invoice_id', { type: 'symbol' }),
        val: nativeToScVal('invoisio-abc123', { type: 'string' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('payer', { type: 'symbol' }),
        val: nativeToScVal(READER, { type: 'address' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('asset', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([nativeToScVal('Native', { type: 'symbol' })]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('amount', { type: 'symbol' }),
        val: nativeToScVal(BigInt(10_000_000), { type: 'i128' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('asset_decimals', { type: 'symbol' }),
        val: nativeToScVal(7, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('timestamp', { type: 'symbol' }),
        val: nativeToScVal(BigInt(1_786_000_000), { type: 'u64' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('settlement_ref', { type: 'symbol' }),
        val: nativeToScVal('settle-hash-abc123', { type: 'string' }),
      }),
    ]);
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(paymentRecord);
      },
    );

    await expect(makeClient().getPayment('invoisio-abc123')).resolves.toEqual({
      invoiceId: 'invoisio-abc123',
      payer: READER,
      asset: { type: 'native' },
      amount: 10_000_000n,
      assetDecimals: 7,
      timestamp: 1_786_000_000n,
      settlementRef: 'settle-hash-abc123',
    });
    expect(simulated).toBeDefined();
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'get_payment',
      args: ['invoisio-abc123'],
    });
  });
});

describe('admin-gated bulk reads (issue #512)', () => {
  it('getPaymentCount() sources the simulation from the admin address and passes it as an argument', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(nativeToScVal(7, { type: 'u32' }));
      },
    );

    await expect(makeClient().getPaymentCount(SIGNER_PUBLIC)).resolves.toBe(7);
    expect((simulated as Transaction).source).toBe(SIGNER_PUBLIC);
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'payment_count',
      args: [SIGNER_PUBLIC],
    });
  });

  it('getPaymentHistory() passes the admin address as the first contract argument', async () => {
    const emptyPage = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('records', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('next_cursor', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('has_more', { type: 'symbol' }),
        val: nativeToScVal(false, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('gaps_skipped', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
    ]);
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(emptyPage);
      },
    );

    await makeClient().getPaymentHistory(SIGNER_PUBLIC, 0, 25);
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'payment_history',
      args: [SIGNER_PUBLIC, 0, 25],
    });
  });

  it('getHistoryIndexStatus() decodes the (history_count, payment_count, is_consistent) tuple', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(
          xdr.ScVal.scvVec([
            nativeToScVal(3, { type: 'u32' }),
            nativeToScVal(3, { type: 'u32' }),
            nativeToScVal(true, { type: 'bool' }),
          ]),
        );
      },
    );

    await expect(
      makeClient().getHistoryIndexStatus(SIGNER_PUBLIC),
    ).resolves.toEqual({
      historyCount: 3,
      paymentCount: 3,
      isConsistent: true,
    });
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'history_index_status',
      args: [SIGNER_PUBLIC],
    });
  });
});

describe('getSettlementRefOwner', () => {
  it('resolves a used settlement reference to its owning invoice ID', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(nativeToScVal('invoisio-abc123', { type: 'string' }));
      },
    );

    await expect(
      makeClient().getSettlementRefOwner('settle-hash-abc123'),
    ).resolves.toBe('invoisio-abc123');
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'settlement_ref_owner',
      args: ['settle-hash-abc123'],
    });
  });

  it('returns null for an unused settlement reference', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(
      simulateSuccess(nativeToScVal(null, { type: 'void' })),
    );

    await expect(makeClient().getSettlementRefOwner('settle-never-used')).resolves.toBeNull();
  });
});

describe('getSettlementRefHistory', () => {
  it('decodes a page of settlement-reference entries in write order', async () => {
    const page = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('records', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: nativeToScVal('settlement_ref', { type: 'symbol' }),
              val: nativeToScVal('settle-001', { type: 'string' }),
            }),
            new xdr.ScMapEntry({
              key: nativeToScVal('invoice_id', { type: 'symbol' }),
              val: nativeToScVal('invoisio-001', { type: 'string' }),
            }),
          ]),
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: nativeToScVal('settlement_ref', { type: 'symbol' }),
              val: nativeToScVal('settle-002', { type: 'string' }),
            }),
            new xdr.ScMapEntry({
              key: nativeToScVal('invoice_id', { type: 'symbol' }),
              val: nativeToScVal('invoisio-002', { type: 'string' }),
            }),
          ]),
        ]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('next_cursor', { type: 'symbol' }),
        val: nativeToScVal(2, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('has_more', { type: 'symbol' }),
        val: nativeToScVal(false, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('gaps_skipped', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
    ]);

    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(page);
      },
    );

    await expect(
      makeClient().getSettlementRefHistory(SIGNER_PUBLIC, 0, 25),
    ).resolves.toEqual({
      records: [
        { settlementRef: 'settle-001', invoiceId: 'invoisio-001' },
        { settlementRef: 'settle-002', invoiceId: 'invoisio-002' },
      ],
      nextCursor: 2,
      hasMore: false,
      gapsSkipped: 0,
    });
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'settlement_ref_history',
      args: [SIGNER_PUBLIC, 0, 25],
    });
  });

  it('defaults cursor to 0 and limit to 25', async () => {
    const emptyPage = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('records', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('next_cursor', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('has_more', { type: 'symbol' }),
        val: nativeToScVal(false, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('gaps_skipped', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
    ]);

    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(emptyPage);
      },
    );

    await makeClient().getSettlementRefHistory(SIGNER_PUBLIC);
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'settlement_ref_history',
      args: [SIGNER_PUBLIC, 0, 25],
    });
  });
});

describe('getSettlementRefIndexStatus', () => {
  it('decodes the (count, count, is_consistent) tuple', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(
          xdr.ScVal.scvVec([
            nativeToScVal(4, { type: 'u32' }),
            nativeToScVal(5, { type: 'u32' }),
            nativeToScVal(false, { type: 'bool' }),
          ]),
        );
      },
    );

    await expect(
      makeClient().getSettlementRefIndexStatus(SIGNER_PUBLIC),
    ).resolves.toEqual({
      settlementRefCount: 4,
      paymentCount: 5,
      isConsistent: false,
    });
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'settlement_ref_index_status',
      args: [SIGNER_PUBLIC],
    });
  });
});

describe('getAllowedAssets', () => {
  it('decodes a page of allowlisted (code, issuer) pairs', async () => {
    const page = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('records', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: nativeToScVal('code', { type: 'symbol' }),
              val: nativeToScVal('USDC', { type: 'string' }),
            }),
            new xdr.ScMapEntry({
              key: nativeToScVal('issuer', { type: 'symbol' }),
              val: nativeToScVal(ISSUER, { type: 'string' }),
            }),
          ]),
        ]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('next_cursor', { type: 'symbol' }),
        val: nativeToScVal(1, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('has_more', { type: 'symbol' }),
        val: nativeToScVal(false, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('gaps_skipped', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
    ]);

    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(page);
      },
    );

    await expect(makeClient().getAllowedAssets(0, 25)).resolves.toEqual({
      records: [{ code: 'USDC', issuer: ISSUER }],
      nextCursor: 1,
      hasMore: false,
      gapsSkipped: 0,
    });
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'allowed_assets',
      args: [0, 25],
    });
  });

  it('defaults cursor to 0 and limit to 25', async () => {
    const emptyPage = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('records', { type: 'symbol' }),
        val: xdr.ScVal.scvVec([]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('next_cursor', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('has_more', { type: 'symbol' }),
        val: nativeToScVal(false, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('gaps_skipped', { type: 'symbol' }),
        val: nativeToScVal(0, { type: 'u32' }),
      }),
    ]);

    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(emptyPage);
      },
    );

    await makeClient().getAllowedAssets();
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'allowed_assets',
      args: [0, 25],
    });
  });
});

describe('getAllowlistCount', () => {
  it('decodes the live allowlist count', async () => {
    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(nativeToScVal(3, { type: 'u32' }));
      },
    );

    await expect(makeClient().getAllowlistCount()).resolves.toBe(3);
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'allowlist_count',
      args: [],
    });
  });
});

describe('config read method', () => {
  it('getConfig() decodes the complete contract config snapshot including paused flag', async () => {
    const configVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('admin', { type: 'symbol' }),
        val: nativeToScVal(SIGNER_PUBLIC, { type: 'address' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('pending_admin', { type: 'symbol' }),
        val: nativeToScVal(null, { type: 'void' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('initialized', { type: 'symbol' }),
        val: nativeToScVal(true, { type: 'bool' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('version', { type: 'symbol' }),
        val: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal('contract_version', { type: 'symbol' }),
            val: nativeToScVal(1_000_000, { type: 'u32' }),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal('storage_schema_version', { type: 'symbol' }),
            val: nativeToScVal(1, { type: 'u32' }),
          }),
        ]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('allowlist_mode', { type: 'symbol' }),
        val: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal('native_allowed', { type: 'symbol' }),
            val: nativeToScVal(true, { type: 'bool' }),
          }),
        ]),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('paused', { type: 'symbol' }),
        val: nativeToScVal(true, { type: 'bool' }),
      }),
    ]);

    let simulated: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(
      async (tx) => {
        simulated = tx as Transaction;
        return simulateSuccess(configVal);
      },
    );

    const client = makeClient();
    const config = await client.getConfig();

    expect(config).toEqual({
      admin: SIGNER_PUBLIC,
      pendingAdmin: null,
      initialized: true,
      version: {
        contractVersion: 1_000_000,
        storageSchemaVersion: 1,
      },
      allowlistMode: {
        nativeAllowed: true,
      },
      paused: true,
    });
    expect(decodeInvocation(simulated as Transaction)).toEqual({
      method: 'config',
      args: [],
    });
  });
});

describe('write methods require a signer', () => {
  it('rejects when no signerSecretKey is configured', async () => {
    const client = makeClient();
    const expected = 'signerSecretKey is required for write operations';

    await expect(client.setPaused(true)).rejects.toThrow(expected);
    await expect(client.allowAsset('USDC', ISSUER)).rejects.toThrow(expected);
    await expect(client.revokeAsset('USDC', ISSUER)).rejects.toThrow(expected);
    await expect(client.setAllowNative(true)).rejects.toThrow(expected);
    await expect(client.upgrade('ab'.repeat(32), 1)).rejects.toThrow(expected);
  });
});

describe('upgrade()', () => {
  it('submits upgrade(caller, new_wasm_hash, new_contract_version) and returns the tx result', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(async (tx) => {
      prepared = tx as Transaction;
      return {
        status: 'PENDING',
        hash: TX_HASH,
        latestLedger: LEDGER,
        latestLedgerCloseTime: 0,
      };
    });
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(async () =>
      getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const client = makeClient(signer.secret());
    const newWasmHash = 'ab'.repeat(32);
    const result = await client.upgrade(newWasmHash, 1_001_000);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(prepared).toBeDefined();
    const invocation = decodeInvocation(prepared as Transaction);
    expect(invocation.method).toBe('upgrade');
    const [caller, wasmHashArg, versionArg] = invocation.args;
    expect(caller).toBe(SIGNER_PUBLIC);
    expect(Buffer.from(wasmHashArg as Uint8Array).toString('hex')).toBe(newWasmHash);
    expect(versionArg).toBe(1_001_000);
  });

  it('rejects a malformed WASM hash before submitting the transaction', async () => {
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    const sendSpy = vi
      .spyOn(rpc.Server.prototype, 'sendTransaction')
      .mockImplementation(async () => {
        throw new Error('sendTransaction should not be reached for a malformed hash');
      });

    const client = makeClient(signer.secret());
    await expect(client.upgrade('not-a-hash', 1)).rejects.toThrow(/32-byte hex-encoded hash/);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('migrateLegacyPayments()', () => {
  it('submits migrate_legacy_payments(caller, invoice_ids) and returns the tx result', async () => {
    let prepared: Transaction | undefined;
    vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SIGNER_PUBLIC, '1'),
    );
    vi.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(
      async (tx) => tx as Transaction,
    );
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockImplementation(async (tx) => {
      prepared = tx as Transaction;
      return {
        status: 'PENDING',
        hash: TX_HASH,
        latestLedger: LEDGER,
        latestLedgerCloseTime: 0,
      };
    });
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(async () =>
      getTransactionSuccess(prepared as Transaction, LEDGER),
    );

    const client = makeClient(signer.secret());
    const result = await client.migrateLegacyPayments(['invoisio-legacy-001', 'invoisio-legacy-002']);

    expect(result).toEqual({ hash: TX_HASH, ledger: LEDGER });
    expect(decodeInvocation(prepared as Transaction)).toEqual({
      method: 'migrate_legacy_payments',
      args: [SIGNER_PUBLIC, ['invoisio-legacy-001', 'invoisio-legacy-002']],
    });
  });

  it('rejects a batch over MAX_LEGACY_MIGRATION_BATCH before submitting', async () => {
    const sendSpy = vi
      .spyOn(rpc.Server.prototype, 'sendTransaction')
      .mockImplementation(async () => {
        throw new Error('sendTransaction should not be reached for an oversized batch');
      });

    const client = makeClient(signer.secret());
    const tooMany = Array.from({ length: 21 }, (_, i) => `invoisio-batch-${i}`);
    await expect(client.migrateLegacyPayments(tooMany)).rejects.toThrow(
      /at most 20 entries/,
    );
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects when no signerSecretKey is configured', async () => {
    const client = makeClient();
    await expect(client.migrateLegacyPayments(['invoisio-legacy-001'])).rejects.toThrow(
      'signerSecretKey is required for write operations',
    );
  });
});
