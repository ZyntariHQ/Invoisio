/**
 * Example: Record an invoice payment on-chain via the Soroban contract.
 *
 * This demonstrates the admin-gated write path. In the Invoisio backend flow
 * this is called after the backend has already verified the companion native
 * Stellar Payment on Horizon (matched by memo).
 *
 * Setup:
 *   1. Build and deploy the contract: cd soroban && ./build.sh && ./deploy.sh
 *   2. Copy .env.example to .env and fill in real values
 *   3. npm install && npm run example:record
 *
 * Sample output:
 *   Recording payment for invoice invoisio-demo-001 ...
 *   ✓  Transaction confirmed
 *      Hash   : e7a4b2c1d9f83a56b0e2c4d7f1a3b8e9c0d2f4a6b8c1d3e5f7a9b0c2d4e6f8a0
 *      Ledger : 588412
 */

import * as dotenv from 'dotenv';

import { SorobanContractError, SorobanInvoiceClient } from '../src';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const client = new SorobanInvoiceClient({
    rpcUrl: requireEnv('SOROBAN_RPC_URL'),
    networkPassphrase: requireEnv('STELLAR_NETWORK_PASSPHRASE'),
    contractId: requireEnv('SOROBAN_CONTRACT_ID'),
    signerSecretKey: requireEnv('ADMIN_SECRET_KEY'),
  });

  const invoiceId = process.env['INVOICE_ID'] ?? 'invoisio-demo-001';

  console.log(`Recording payment for invoice ${invoiceId} ...`);

  try {
    const result = await client.recordPayment({
      invoiceId,
      payer: requireEnv('PAYER_PUBLIC_KEY'),
      // 150 USDC — Stellar tokens use 7 decimal places: 150 * 10_000_000
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount: 1_500_000_000n,
    });

    console.log('✓  Transaction confirmed');
    console.log(`   Hash   : ${result.hash}`);
    console.log(`   Ledger : ${result.ledger}`);
  } catch (err) {
    if (err instanceof SorobanContractError) {
      console.error(`Contract error [${err.code}]: ${err.message}`);
    } else {
      console.error('Unexpected error:', err);
    }
    process.exit(1);
  }
}

main();
