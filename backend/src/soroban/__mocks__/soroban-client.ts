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
  settlementRef: string;
}

export interface RecordPaymentParams {
  invoiceId: string;
  payer: string;
  assetCode: string;
  assetIssuer: string;
  amount: bigint;
  settlementRef: string;
}

export interface TransactionResult {
  hash: string;
  ledger: number;
}

export class SorobanContractError extends Error {
  override readonly name = "SorobanContractError";
  constructor(
    public readonly code: string,
    public readonly numericCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Minimal stand-in for the real package's `parseContractError`. Recognizes
 * only the codes backend tests actually exercise — extend as needed rather
 * than trying to fully mirror `soroban/client/src/error-manifest.ts` here.
 */
const KNOWN_CONTRACT_ERROR_CODES: Record<number, string> = {
  3: "PaymentAlreadyRecorded",
  9: "Unauthorized",
  12: "ContractPaused",
  13: "InvalidSettlementRef",
};

const CONTRACT_ERROR_RE = /Error\(Contract,\s*#(\d+)\)|contractError\((\d+)\)/;

export function parseContractError(errorString: string): SorobanContractError {
  const match = CONTRACT_ERROR_RE.exec(errorString);
  const numericCode = match ? parseInt(match[1] ?? match[2], 10) : -1;
  const code = KNOWN_CONTRACT_ERROR_CODES[numericCode] ?? "Unknown";
  return new SorobanContractError(
    code,
    numericCode,
    `Soroban contract error: ${code} (code=${numericCode})`,
  );
}

export class SorobanInvoiceClient {
  constructor(_config: unknown) {}

  async recordPayment(
    _params: RecordPaymentParams,
  ): Promise<TransactionResult> {
    throw new Error("stub — replace with jest.fn() in tests");
  }

  async getPayment(_invoiceId: string): Promise<PaymentRecord> {
    throw new Error("stub — replace with jest.fn() in tests");
  }

  async hasPayment(_invoiceId: string): Promise<boolean> {
    throw new Error("stub — replace with jest.fn() in tests");
  }

  async getPaymentCount(): Promise<number> {
    throw new Error("stub — replace with jest.fn() in tests");
  }
}
