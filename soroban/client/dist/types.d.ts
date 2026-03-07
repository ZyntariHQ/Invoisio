export type AssetNative = {
    readonly type: 'native';
};
export type AssetToken = {
    readonly type: 'token';
    /** Token code, e.g. "USDC" */
    readonly code: string;
    /** Issuer Stellar address (G...) */
    readonly issuer: string;
};
export type Asset = AssetNative | AssetToken;
/** On-chain record stored for each invoice payment. */
export interface PaymentRecord {
    readonly invoiceId: string;
    /** Stellar account (G...) that made the payment */
    readonly payer: string;
    readonly asset: Asset;
    /**
     * Amount in smallest denomination.
     * - XLM: stroops — 1 XLM = 10_000_000 stroops
     * - Token: 7-decimal units — 1 USDC = 10_000_000 units
     */
    readonly amount: bigint;
    /** Unix seconds at which the ledger included this record */
    readonly timestamp: bigint;
}
/** Numeric codes matching the Rust `ContractError` enum. */
export declare const CONTRACT_ERROR_CODES: {
    readonly 1: "AlreadyInitialized";
    readonly 2: "NotInitialized";
    readonly 3: "PaymentAlreadyRecorded";
    readonly 4: "PaymentNotFound";
    readonly 5: "InvalidAmount";
    readonly 6: "InvalidInvoiceId";
    readonly 7: "InvalidAsset";
};
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES] | 'Unknown';
export declare class SorobanContractError extends Error {
    readonly code: ContractErrorCode;
    readonly numericCode: number;
    readonly name = "SorobanContractError";
    constructor(code: ContractErrorCode, numericCode: number, message: string);
}
export interface SorobanInvoiceClientConfig {
    /** Soroban RPC URL, e.g. https://soroban-testnet.stellar.org */
    readonly rpcUrl: string;
    /** Stellar network passphrase */
    readonly networkPassphrase: string;
    /** Deployed contract ID (C...) */
    readonly contractId: string;
    /**
     * Stellar public key (G...) used as the transaction source for read-only
     * simulation calls. Falls back to the key derived from `signerSecretKey`
     * when omitted.
     */
    readonly sourcePublicKey?: string;
    /**
     * Admin secret key (S...). Required for write operations: record_payment.
     * Must be read from environment — never hard-code.
     */
    readonly signerSecretKey?: string;
}
export interface RecordPaymentParams {
    /** Unique invoice identifier, e.g. "invoisio-abc123" */
    readonly invoiceId: string;
    /** Stellar G... address of the payer */
    readonly payer: string;
    /** "XLM" or a token code such as "USDC" */
    readonly assetCode: string;
    /** Issuer G... address for token assets; empty string ("") for XLM */
    readonly assetIssuer: string;
    /** Amount in smallest denomination (must be > 0) */
    readonly amount: bigint;
}
/** Confirmed on-chain transaction result. */
export interface TransactionResult {
    readonly hash: string;
    readonly ledger: number;
}
//# sourceMappingURL=types.d.ts.map