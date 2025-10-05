import { registerAs } from '@nestjs/config';

export default registerAs('starknet', () => ({
  rpcUrl: process.env.STARKNET_RPC_URL,
}));