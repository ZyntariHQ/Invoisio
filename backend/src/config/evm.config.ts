import { registerAs } from '@nestjs/config';

export default registerAs('evm', () => ({
  rpcUrl: process.env.EVM_RPC_URL,
  chainId: parseInt(process.env.EVM_CHAIN_ID || '84532', 10),
  merchantAddress: process.env.EVM_MERCHANT_ADDRESS,
  usdcAddress: process.env.EVM_USDC_ADDRESS,
  routerAddress: process.env.EVM_ROUTER_ADDRESS,
}));