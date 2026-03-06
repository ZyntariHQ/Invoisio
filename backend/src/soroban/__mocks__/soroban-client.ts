/**
 * Test stub for @invoisio/soroban-client.
 *
 * Keeps all Jest module resolution inside backend/node_modules/ so CI does not
 * need soroban/client/node_modules/ installed. Exports the same public surface
 * as the real library without importing @stellar/stellar-sdk.
 */

export interface PaymentRecord {
  invoiceId: string;
  payer: string;
  asset: unknown;
  amount: bigint;
  timestamp: bigint;
}

export interface RecordPaymentParams {
  invoiceId: string;
  payer: string;
  assetCode: string;
  assetIssuer: string;
  amount: bigint;
}

export interface TransactionResult {
  hash: string;
  ledger: number;
}

export class SorobanContractError extends Error {
  override readonly name = 'SorobanContractError';
  constructor(
    public readonly code: string,
    public readonly numericCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class SorobanInvoiceClient {
  constructor(_config: unknown) {}

  async recordPayment(
    _params: RecordPaymentParams,
  ): Promise<TransactionResult> {
    throw new Error('stub — replace with jest.fn() in tests');
  }

  async getPayment(_invoiceId: string): Promise<PaymentRecord> {
    throw new Error('stub — replace with jest.fn() in tests');
  }

  async hasPayment(_invoiceId: string): Promise<boolean> {
    throw new Error('stub — replace with jest.fn() in tests');
  }

  async getPaymentCount(): Promise<number> {
    throw new Error('stub — replace with jest.fn() in tests');
  }
}
