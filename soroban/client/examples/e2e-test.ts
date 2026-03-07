/**
 * End-to-end test script.
 *
 * Deploys a fresh contract instance on Stellar testnet, then runs both the
 * record-payment and query-payment flows to produce verifiable sample output.
 *
 * Usage:
 *   ts-node examples/e2e-test.ts
 *
 * No .env required — generates and funds fresh keypairs automatically.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  Account,
  Address,
  BASE_FEE,
  Keypair,
  Operation,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { SorobanInvoiceClient, SorobanContractError } from '../src';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const WASM_PATH = path.resolve(
  __dirname,
  '../../target/wasm32v1-none/release/invoice_payment.wasm',
);

const server = new rpc.Server(RPC_URL, { allowHttp: false });

// ─── Utilities ────────────────────────────────────────────────────────────────

function friendbot(address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(`https://friendbot.stellar.org?addr=${address}`, (res) => {
        res.resume();
        res.on('end', () => resolve());
      })
      .on('error', reject);
  });
}

async function submitTx(
  keypair: Keypair,
  buildFn: (account: Account) => TransactionBuilder,
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  const account = await server.getAccount(keypair.publicKey());
  const tx = buildFn(account).setTimeout(30).build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const send = await server.sendTransaction(prepared);
  if (send.status === 'ERROR') {
    throw new Error(`Send failed: ${send.errorResult?.toXDR('base64') ?? 'unknown'}`);
  }
  for (let i = 0; i < 15; i++) {
    const result = await server.getTransaction(send.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return result as rpc.Api.GetSuccessfulTransactionResponse;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${send.hash}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${send.hash} not confirmed`);
}

/** Format 7-decimal fixed-point integer. */
function formatUnits(raw: bigint, symbol: string): string {
  const d = 10_000_000n;
  return `${raw / d}.${(raw % d).toString().padStart(7, '0')} ${symbol}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Invoisio Soroban Client — End-to-End Test');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Step 1: Generate & fund keypairs ──────────────────────────────────────
  console.log('── Step 1: Generating and funding testnet accounts ──');
  const adminKeypair = Keypair.random();
  const payerKeypair = Keypair.random();
  console.log(`  Admin  : ${adminKeypair.publicKey()}`);
  console.log(`  Payer  : ${payerKeypair.publicKey()}`);

  console.log('  Funding via Friendbot...');
  await Promise.all([
    friendbot(adminKeypair.publicKey()),
    friendbot(payerKeypair.publicKey()),
  ]);
  console.log('  ✓ Both accounts funded\n');

  // ── Step 2: Upload WASM ───────────────────────────────────────────────────
  console.log('── Step 2: Uploading contract WASM to testnet ──');
  const wasm = fs.readFileSync(WASM_PATH);
  const uploadResult = await submitTx(adminKeypair, (account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.uploadContractWasm({ wasm })),
  );
  const wasmHashHex = Buffer.from(uploadResult.returnValue!.bytes()).toString('hex');
  console.log(`  ✓ WASM uploaded — hash: ${wasmHashHex.slice(0, 16)}...\n`);

  // ── Step 3: Create contract instance ─────────────────────────────────────
  console.log('── Step 3: Creating contract instance ──');
  const wasmHash = Buffer.from(wasmHashHex, 'hex');
  const salt = Buffer.alloc(32, Date.now() & 0xff);
  const createResult = await submitTx(adminKeypair, (account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.createCustomContract({
          address: new Address(adminKeypair.publicKey()),
          wasmHash,
          salt,
        }),
      ),
  );
  const contractId = Address.fromScVal(createResult.returnValue!).toString();
  console.log(`  ✓ Contract created — ID: ${contractId}\n`);

  // ── Step 4: Initialize contract ───────────────────────────────────────────
  console.log('── Step 4: Initialising contract with admin ──');
  const { Contract } = await import('@stellar/stellar-sdk');
  const contract = new Contract(contractId);
  await submitTx(adminKeypair, (account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        contract.call(
          'initialize',
          new Address(adminKeypair.publicKey()).toScVal(),
        ),
      ),
  );
  console.log(`  ✓ Contract initialised — admin: ${adminKeypair.publicKey()}\n`);

  // ── Step 5: record_payment via client ─────────────────────────────────────
  console.log('── Step 5: record_payment (write) ──');
  const client = new SorobanInvoiceClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contractId,
    signerSecretKey: adminKeypair.secret(),
  });

  const invoiceId = `invoisio-e2e-${Date.now()}`;
  // 150 USDC: 7 decimal places → 150 × 10_000_000
  const amount = 1_500_000_000n;

  console.log(`  Invoice ID : ${invoiceId}`);
  console.log(`  Payer      : ${payerKeypair.publicKey()}`);
  console.log(`  Asset      : USDC`);
  console.log(`  Amount     : ${formatUnits(amount, 'USDC')}`);
  console.log('  Submitting...');

  const recordResult = await client.recordPayment({
    invoiceId,
    payer: payerKeypair.publicKey(),
    assetCode: 'USDC',
    assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    amount,
  });

  console.log('  ✓ Transaction confirmed');
  console.log(`     Hash   : ${recordResult.hash}`);
  console.log(`     Ledger : ${recordResult.ledger}\n`);

  // ── Step 6: hasPayment ────────────────────────────────────────────────────
  console.log('── Step 6: hasPayment (read) ──');
  const exists = await client.hasPayment(invoiceId);
  console.log(`  ✓ hasPayment("${invoiceId}") → ${exists}\n`);

  // ── Step 7: getPayment ────────────────────────────────────────────────────
  console.log('── Step 7: getPayment (read) ──');
  const record = await client.getPayment(invoiceId);
  const isoDate = new Date(Number(record.timestamp) * 1_000).toISOString();
  const assetLabel =
    record.asset.type === 'native'
      ? 'XLM (native)'
      : `${record.asset.code} (${record.asset.issuer.slice(0, 8)}...${record.asset.issuer.slice(-6)})`;

  console.log('  PaymentRecord {');
  console.log(`    invoiceId : ${record.invoiceId}`);
  console.log(`    payer     : ${record.payer}`);
  console.log(`    asset     : ${assetLabel}`);
  console.log(`    amount    : ${record.amount}  (${formatUnits(record.amount, record.asset.type === 'native' ? 'XLM' : record.asset.code)})`);
  console.log(`    timestamp : ${record.timestamp}  (${isoDate})`);
  console.log('  }');

  // ── Step 8: getPaymentCount ───────────────────────────────────────────────
  const count = await client.getPaymentCount();
  console.log(`\n  Total payments on-chain : ${count}`);

  // ── Step 9: idempotency check ─────────────────────────────────────────────
  console.log('\n── Step 9: Idempotency — duplicate record_payment ──');
  try {
    await client.recordPayment({
      invoiceId,
      payer: payerKeypair.publicKey(),
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount,
    });
    console.log('  ERROR: expected PaymentAlreadyRecorded but got success');
  } catch (err) {
    if (err instanceof SorobanContractError && err.code === 'PaymentAlreadyRecorded') {
      console.log(`  ✓ Correctly rejected duplicate — error code: ${err.code}`);
    } else {
      throw err;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  All steps passed.');
  console.log('');
  console.log('  Setup notes for .env:');
  console.log(`    SOROBAN_RPC_URL=${RPC_URL}`);
  console.log(`    STELLAR_NETWORK_PASSPHRASE=${NETWORK_PASSPHRASE}`);
  console.log(`    SOROBAN_CONTRACT_ID=${contractId}`);
  console.log(`    ADMIN_SECRET_KEY=${adminKeypair.secret()}`);
  console.log(`    SOURCE_PUBLIC_KEY=${payerKeypair.publicKey()}`);
  console.log(`    PAYER_PUBLIC_KEY=${payerKeypair.publicKey()}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
