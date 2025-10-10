import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcProvider } from 'starknet';

@Injectable()
export class StarknetService {
  private provider: RpcProvider;

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('starknet.rpcUrl') || this.configService.get<string>('STARKNET_RPC_URL');
    this.provider = new RpcProvider({ nodeUrl: rpcUrl });
  }

  async transferToken(params: { from: string; to: string; token: string; amount: string }): Promise<{ transactionHash: string }> {
    // NOTE: Without an account signer/private key we cannot submit a real transfer from backend.
    // For now return a deterministic mock tx hash to allow flow; front-end wallet should perform transfer in production.
    const mockHash = `0x${Buffer.from(`${params.from}-${params.to}-${params.token}-${params.amount}-${Date.now()}`)
      .toString('hex')
      .slice(0, 62)}`;
    return { transactionHash: mockHash };
  }

  async getTxStatus(txHash: string): Promise<{ status: 'pending' | 'processing' | 'completed' | 'failed' } & { raw?: any }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      const finality = (receipt as any).finality_status || (receipt as any).status || 'RECEIVED';
      const execution = (receipt as any).execution_status || 'SUCCEEDED';
      if (finality === 'ACCEPTED_ON_L2' || finality === 'ACCEPTED_ON_L1') {
        return { status: execution === 'SUCCEEDED' ? 'completed' : 'failed', raw: receipt };
      }
      if (finality === 'RECEIVED') return { status: 'pending', raw: receipt };
      if (finality === 'REJECTED') return { status: 'failed', raw: receipt };
      return { status: 'processing', raw: receipt };
    } catch (e) {
      // If provider cannot find the tx yet, consider pending
      return { status: 'pending' } as any;
    }
  }
}