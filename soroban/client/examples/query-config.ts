import { SorobanInvoiceClient } from '../src';

async function main() {
  const contractId = process.env.CONTRACT_ID;
  const sourcePublicKey = process.env.SOURCE_PUBLIC_KEY;

  if (!contractId) {
    throw new Error('CONTRACT_ID is required');
  }
  if (!sourcePublicKey) {
    throw new Error('SOURCE_PUBLIC_KEY is required');
  }

  const client = new SorobanInvoiceClient({
    rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
    contractId,
    sourcePublicKey,
  });

  const config = await client.getConfig();

  console.log('ContractConfig', {
    admin: config.admin,
    initialized: config.initialized,
    contractVersion: config.version.contractVersion,
    storageSchemaVersion: config.version.storageSchemaVersion,
    nativeAllowed: config.allowlistMode.nativeAllowed,
    requiresTokenAllowlist: config.allowlistMode.requiresTokenAllowlist,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
