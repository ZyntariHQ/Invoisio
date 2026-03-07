"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanInvoiceClient = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const codec_1 = require("./codec");
/**
 * Upper bound on ledger polls when awaiting transaction confirmation.
 * 10 × 2 s = 20 s covers ~4 Stellar ledger closes at ~5 s each.
 */
const MAX_POLL_ATTEMPTS = 10;
/** Sleep duration between each poll. */
const POLL_INTERVAL_MS = 2_000;
/** Transaction validity window submitted to the network. */
const TX_TIMEOUT_SECONDS = 30;
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
class SorobanInvoiceClient {
    server;
    contract;
    config;
    /** Cached keypair — derived once at construction, not re-derived per call. */
    keypair;
    constructor(config) {
        if (!config.signerSecretKey && !config.sourcePublicKey) {
            throw new Error('SorobanInvoiceClient requires either signerSecretKey or sourcePublicKey');
        }
        this.config = config;
        // Created once; underlying HTTP connection is reused across all calls.
        this.server = new stellar_sdk_1.rpc.Server(config.rpcUrl, { allowHttp: false });
        this.contract = new stellar_sdk_1.Contract(config.contractId);
        // Parse the keypair once — elliptic curve derivation is not free.
        this.keypair = config.signerSecretKey
            ? stellar_sdk_1.Keypair.fromSecret(config.signerSecretKey)
            : undefined;
    }
    // ─── Write operations ───────────────────────────────────────────────────────
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
    async recordPayment(params) {
        this.requireSigner();
        // server.getAccount() is needed here: submitted transactions must carry
        // the correct on-chain sequence number to prevent replay attacks.
        const account = await this.server.getAccount(this.keypair.publicKey());
        const tx = new stellar_sdk_1.TransactionBuilder(account, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.config.networkPassphrase,
        })
            .addOperation(this.contract.call('record_payment', (0, codec_1.encodeString)(params.invoiceId), (0, codec_1.encodeAddress)(params.payer), (0, codec_1.encodeString)(params.assetCode), (0, codec_1.encodeString)(params.assetIssuer), (0, codec_1.encodeI128)(params.amount)))
            .setTimeout(TX_TIMEOUT_SECONDS)
            .build();
        // prepareTransaction simulates and assembles the fee + storage footprint.
        // It throws if the simulation fails (e.g. contract returns Err(...)).
        let prepared;
        try {
            prepared = await this.server.prepareTransaction(tx);
        }
        catch (err) {
            throw (0, codec_1.parseContractError)(err instanceof Error ? err.message : String(err));
        }
        prepared.sign(this.keypair);
        const sendResult = await this.server.sendTransaction(prepared);
        if (sendResult.status === 'ERROR') {
            const detail = sendResult.errorResult?.toXDR('base64') ?? 'unknown';
            throw new Error(`Transaction rejected by network: ${detail}`);
        }
        return this.awaitTransaction(sendResult.hash);
    }
    // ─── Read operations (permissionless) ──────────────────────────────────────
    /**
     * Fetch the full `PaymentRecord` for an invoice.
     *
     * @throws {SorobanContractError} with code `PaymentNotFound` if not recorded
     */
    async getPayment(invoiceId) {
        const retval = await this.simulateView('get_payment', (0, codec_1.encodeString)(invoiceId));
        return (0, codec_1.decodePaymentRecord)(retval);
    }
    /**
     * Return `true` if a payment has been recorded for the given invoice ID.
     * Use this as an idempotency check before calling `recordPayment`.
     */
    async hasPayment(invoiceId) {
        const retval = await this.simulateView('has_payment', (0, codec_1.encodeString)(invoiceId));
        return Boolean((0, stellar_sdk_1.scValToNative)(retval));
    }
    /**
     * Return the total number of payments recorded in this contract instance.
     */
    async getPaymentCount() {
        const retval = await this.simulateView('payment_count');
        return Number((0, stellar_sdk_1.scValToNative)(retval));
    }
    // ─── Private helpers ────────────────────────────────────────────────────────
    /**
     * Build and simulate a read-only contract call without submitting a transaction.
     *
     * Uses `new Account(pk, '0')` instead of `server.getAccount()` because
     * Soroban simulation does not validate the sequence number — this saves one
     * network round-trip per read call.
     *
     * Time: O(1) — single RPC round-trip.
     */
    async simulateView(method, ...args) {
        // Sequence '0' is intentional: simulation ignores it.
        const account = new stellar_sdk_1.Account(this.resolveSourcePublicKey(), '0');
        const tx = new stellar_sdk_1.TransactionBuilder(account, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.config.networkPassphrase,
        })
            .addOperation(this.contract.call(method, ...args))
            .setTimeout(TX_TIMEOUT_SECONDS)
            .build();
        const result = await this.server.simulateTransaction(tx);
        if (stellar_sdk_1.rpc.Api.isSimulationError(result)) {
            throw (0, codec_1.parseContractError)(result.error);
        }
        if (!result.result?.retval) {
            throw new Error(`Contract method '${method}' returned no value`);
        }
        return result.result.retval;
    }
    /**
     * Poll for transaction confirmation until SUCCESS, FAILED, or the attempt
     * limit is reached.
     *
     * Time: O(k) where k ≤ MAX_POLL_ATTEMPTS.
     */
    async awaitTransaction(hash) {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
            const result = await this.server.getTransaction(hash);
            if (result.status === stellar_sdk_1.rpc.Api.GetTransactionStatus.SUCCESS) {
                return { hash, ledger: result.ledger };
            }
            if (result.status === stellar_sdk_1.rpc.Api.GetTransactionStatus.FAILED) {
                throw new Error(`Transaction failed on-chain: ${hash}`);
            }
            // NOT_FOUND → not yet included in a ledger; sleep and retry.
            await sleep(POLL_INTERVAL_MS);
        }
        throw new Error(`Transaction ${hash} not confirmed after ${MAX_POLL_ATTEMPTS} polls ` +
            `(${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1_000} s)`);
    }
    resolveSourcePublicKey() {
        return this.keypair?.publicKey() ?? this.config.sourcePublicKey;
    }
    requireSigner() {
        if (!this.keypair) {
            throw new Error('signerSecretKey is required for write operations');
        }
    }
}
exports.SorobanInvoiceClient = SorobanInvoiceClient;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=soroban-invoice-client.js.map