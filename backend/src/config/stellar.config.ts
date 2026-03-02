import { registerAs } from '@nestjs/config';

/**
 * Stellar network configuration
 * Supports both testnet and mainnet via environment variables
 */
export default registerAs('stellar', () => ({
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  merchantPublicKey: process.env.MERCHANT_PUBLIC_KEY || '',
  usdcIssuer: process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  usdcAssetCode: process.env.USDC_ASSET_CODE || 'USDC',
  memoPrefix: process.env.MEMO_PREFIX || 'invoisio-',
}));
