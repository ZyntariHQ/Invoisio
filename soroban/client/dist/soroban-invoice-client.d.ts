import { PaymentRecord, RecordPaymentParams, SorobanInvoiceClientConfig, TransactionResult } from './types';
/**
 * Minimal client helper for the Invoisio `invoice-payment` Soroban contract.
 *
 * ## Instantiation
 * Create one instance per process lifetime; the `rpc.Server` and
 * `Keypair` are initialised once in the constructor and reused across calls.
 *
 * ## Complexity
 * | Method           | Time                       | Space |
 * |------------------|----------------------------|-------|
 * | `recordPayment`  | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `getPayment`     | O(1)                       | O(1) |
 * | `hasPayment`     | O(1)                       | O(1) |
 * | `getPaymentCount`| O(1)                       | O(1) |
 *
 * Read methods use `new Account(pk, '0')` instead of `server.getAccount()`.
 * Simulation does not validate the sequence number, so this saves one
 * full network round-trip per read call.
 */
export declare class SorobanInvoiceClient {
    private readonly server;
    private readonly contract;
    private readonly config;
    /** Cached keypair — derived once at construction, not re-derived per call. */
    private readonly keypair;
    constructor(config: SorobanInvoiceClientConfig);
    /**
     * Record a verified invoice payment on-chain.
     *
     * The caller is responsible for confirming the companion Stellar Payment on
     * Horizon **before** calling this method. The contract admin keypair must be
     * provided via `signerSecretKey` in the config.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `PaymentAlreadyRecorded`, `InvalidAmount`)
     * @throws {Error} on network errors or confirmation timeout
     */
    recordPayment(params: RecordPaymentParams): Promise<TransactionResult>;
    /**
     * Fetch the full `PaymentRecord` for an invoice.
     *
     * @throws {SorobanContractError} with code `PaymentNotFound` if not recorded
     */
    getPayment(invoiceId: string): Promise<PaymentRecord>;
    /**
     * Return `true` if a payment has been recorded for the given invoice ID.
     * Use this as an idempotency check before calling `recordPayment`.
     */
    hasPayment(invoiceId: string): Promise<boolean>;
    /**
     * Return the total number of payments recorded in this contract instance.
     */
    getPaymentCount(): Promise<number>;
    /**
     * Build and simulate a read-only contract call without submitting a transaction.
     *
     * Uses `new Account(pk, '0')` instead of `server.getAccount()` because
     * Soroban simulation does not validate the sequence number — this saves one
     * network round-trip per read call.
     *
     * Time: O(1) — single RPC round-trip.
     */
    private simulateView;
    /**
     * Poll for transaction confirmation until SUCCESS, FAILED, or the attempt
     * limit is reached.
     *
     * Time: O(k) where k ≤ MAX_POLL_ATTEMPTS.
     */
    private awaitTransaction;
    private resolveSourcePublicKey;
    private requireSigner;
}
//# sourceMappingURL=soroban-invoice-client.d.ts.map