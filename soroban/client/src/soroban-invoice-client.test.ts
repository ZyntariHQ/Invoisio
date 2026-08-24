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
  it('recordPayment() submits record_payment with settlementRef as the 6th argument', async () => {
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
      args: ['invoisio-abc123', READER, 'XLM', '', amount, 'settle-hash-abc123'],
    });
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
          new xdr.ScMapEntry({
            key: nativeToScVal('requires_token_allowlist', { type: 'symbol' }),
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
        requiresTokenAllowlist: true,
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
  });
});
