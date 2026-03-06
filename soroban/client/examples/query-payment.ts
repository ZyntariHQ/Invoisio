/**
 * Example: Query an invoice payment from the Soroban contract.
 *
 * This is a read-only operation — no secret key required, no transaction
 * submitted. Only a funded source account public key is needed to build
 * the simulation transaction.
 *
 * Setup:
 *   1. Copy .env.example to .env and fill in real values
 *   2. npm install && npm run example:query
 *
 * Sample output:
 *   Checking invoice invoisio-demo-001 ...
 *   Payment recorded: true
 *
 *   PaymentRecord {
 *     invoiceId : invoisio-demo-001
 *     payer     : GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKRFAXMSYF6AEQYEOJ2NYJH
 *     asset     : USDC (GA5ZSEJ...K4KZVN)
 *     amount    : 1500000000  (150.0000000 USDC)
 *     timestamp : 1741910400  (2025-03-14T00:00:00.000Z)
 *   }
 *
 *   Total payments on-chain: 1
 */

import * as dotenv from 'dotenv';

import { PaymentRecord, SorobanContractError, SorobanInvoiceClient } from '../src';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function formatRecord(record: PaymentRecord): void {
  const assetLabel =
    record.asset.type === 'native'
      ? 'XLM (native)'
      : `${record.asset.code} (${record.asset.issuer.slice(0, 8)}...${record.asset.issuer.slice(-6)})`;

  const isoDate = new Date(Number(record.timestamp) * 1_000).toISOString();

  console.log('\nPaymentRecord {');
  console.log(`  invoiceId : ${record.invoiceId}`);
  console.log(`  payer     : ${record.payer}`);
  console.log(`  asset     : ${assetLabel}`);
  console.log(`  amount    : ${record.amount}  (${formatUnits(record.amount)} ${record.asset.type === 'native' ? 'XLM' : record.asset.code})`);
  console.log(`  timestamp : ${record.timestamp}  (${isoDate})`);
  console.log('}');
}

/** Convert 7-decimal fixed-point integer to a human-readable string. */
function formatUnits(raw: bigint): string {
  const divisor = 10_000_000n;
  const whole = raw / divisor;
  const fraction = raw % divisor;
  return `${whole}.${fraction.toString().padStart(7, '0')}`;
}

async function main(): Promise<void> {
  // Read-only: provide sourcePublicKey, no signerSecretKey needed.
  const client = new SorobanInvoiceClient({
    rpcUrl: requireEnv('SOROBAN_RPC_URL'),
    networkPassphrase: requireEnv('STELLAR_NETWORK_PASSPHRASE'),
    contractId: requireEnv('SOROBAN_CONTRACT_ID'),
    sourcePublicKey: process.env['SOURCE_PUBLIC_KEY'] ?? process.env['PAYER_PUBLIC_KEY'],
  });

  const invoiceId = process.env['INVOICE_ID'] ?? 'invoisio-demo-001';

  console.log(`Checking invoice ${invoiceId} ...`);

  const exists = await client.hasPayment(invoiceId);
  console.log(`Payment recorded: ${exists}`);

  if (exists) {
    try {
      const record = await client.getPayment(invoiceId);
      formatRecord(record);
    } catch (err) {
      if (err instanceof SorobanContractError) {
        console.error(`Contract error [${err.code}]: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  const count = await client.getPaymentCount();
  console.log(`\nTotal payments on-chain: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
