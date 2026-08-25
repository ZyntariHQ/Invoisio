import { ContractConfig, PaymentHistoryPage, PaymentRecord, RecordPaymentParams, SorobanInvoiceClientConfig, TransactionResult } from './types';
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
 * | `allowAsset`     | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `revokeAsset`    | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `setAllowNative` | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `setPaused`      | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `upgrade`        | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `getAdmin`       | O(1)                       | O(1) |
 * | `isPaused`       | O(1)                       | O(1) |
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
     * `params.settlementRef` is the normalised settlement reference (e.g. a
     * SHA-256 hash or reconciliation ID) used for backend deduplication and
     * idempotent reconciliation. It must be non-empty and at most 128 chars —
     * the contract rejects longer values with `InvalidSettlementRef`.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `PaymentAlreadyRecorded`, `InvalidAmount`, `InvalidSettlementRef`)
     * @throws {Error} on network errors or confirmation timeout
     */
    recordPayment(params: RecordPaymentParams): Promise<TransactionResult>;
    /**
     * Step 1 of the two-step admin handoff: propose `newAdmin` as the next
     * contract admin.
     *
     * The **current admin** keypair must be provided via `signerSecretKey` in
     * the config. The role does NOT change until the proposed address calls
     * `acceptAdmin`.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `PendingAdminExists`, `InvalidProposedAdmin`)
     */
    proposeAdmin(newAdmin: string): Promise<TransactionResult>;
    /**
     * Step 2 of the two-step admin handoff: accept a pending proposal and become
     * the contract admin.
     *
     * The **proposed admin** keypair must be provided via `signerSecretKey` in
     * the config — the caller is derived from that keypair and must match the
     * address proposed by `proposeAdmin`.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NoPendingAdmin`, `Unauthorized`)
     */
    acceptAdmin(): Promise<TransactionResult>;
    /**
     * Cancel a pending admin transfer proposal (recovery path for the two-step
     * handoff).
     *
     * The **current admin** keypair must be provided via `signerSecretKey` in
     * the config. After a successful cancellation `pendingAdmin()` reads `null`
     * again, the previously proposed address can no longer claim the role, and
     * `proposeAdmin()` can be used for a fresh proposal.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NoPendingAdmin`, `Unauthorized`)
     */
    cancelAdminTransfer(): Promise<TransactionResult>;
    /**
     * Add a `(code, issuer)` token pair to the admin-controlled allowlist.
     *
     * Only assets that have been allowlisted are accepted by `recordPayment`.
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`)
     */
    allowAsset(code: string, issuer: string): Promise<TransactionResult>;
    /**
     * Remove a `(code, issuer)` token pair from the allowlist.
     *
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     * Revoking an asset that was never allowlisted is a no-op on-chain.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`)
     */
    revokeAsset(code: string, issuer: string): Promise<TransactionResult>;
    /**
     * Toggle whether native XLM payments are accepted by `recordPayment`.
     *
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `Unauthorized`)
     */
    setAllowNative(allowed: boolean): Promise<TransactionResult>;
    /**
     * Pause or unpause the contract.
     *
     * While paused, write operations (e.g. `recordPayment`) are rejected with
     * `ContractPaused`; read operations remain available. The caller is derived
     * from `signerSecretKey` and must match the contract admin.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `Unauthorized`)
     */
    setPaused(paused: boolean): Promise<TransactionResult>;
    /**
     * Upgrade the deployed contract WASM in place.
     *
     * The contract MUST already be paused via `setPaused(true)` — this is
     * enforced on-chain and the call is rejected with
     * `MustBePausedForUpgrade` otherwise. See
     * `soroban/docs/upgrade-runbook.md` for the full
     * pause → upgrade → upgrade_storage → verify → unpause sequence, and why
     * the contract must stay paused for that whole window.
     *
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     *
     * @param newWasmHash - hex-encoded 32-byte hash of the WASM already
     *   installed on-chain (e.g. via `stellar contract upload`).
     * @param newContractVersion - packed semver of the WASM being deployed
     *   (`MAJOR * 1_000_000 + MINOR * 1_000 + PATCH`), carried in the emitted
     *   `contract_upgraded` event for off-chain indexers. Not verified
     *   on-chain against `newWasmHash` — must match what was actually built.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `Unauthorized`, `MustBePausedForUpgrade`)
     */
    upgrade(newWasmHash: string, newContractVersion: number): Promise<TransactionResult>;
    /**
     * Return the stable high-level contract configuration snapshot.
     *
     * This is the preferred single-call read for deployment checks, backend
     * health probes, and UI bootstrapping because it includes admin ownership,
     * initialization status, version metadata, and allowlist policy together.
     */
    getConfig(): Promise<ContractConfig>;
    /**
     * Return the current contract admin address. Permissionless read.
     *
     * @throws {SorobanContractError} with code `NotInitialized` if the contract
     *   has not been initialised yet.
     */
    getAdmin(): Promise<string>;
    /**
     * Return the address currently proposed as the next admin, or `null` when no
     * admin transfer is in flight. Permissionless read.
     */
    getPendingAdmin(): Promise<string | null>;
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
     * Fetch a bounded page of payment history using a cursor-based read.
     *
     * `cursor` is the next history index to read, and `limit` is capped by the
     * contract so responses remain bounded and predictable.
     */
    getPaymentHistory(cursor?: number, limit?: number): Promise<PaymentHistoryPage>;
    /**
     * Fetch a bounded page of payments made by a single payer.
     *
     * Two contract read paths are selected automatically per payer:
     *
     * - **Per-payer index (default).** Payments recorded after the index was
     *   introduced (or backfilled by the schema V2 migration /
     *   `rebuild_history_index`) are served with O(limit) direct reads. Here
     *   `cursor` is an ordinal into that payer's payment list — start at `0`
     *   and echo `next_cursor` afterwards.
     *
     * - **Bounded scan (fallback).** For payers without an index (pre-V2 data
     *   not yet migrated), the contract scans the shared history index with
     *   the filter applied, capped at `MAX_PAYER_SCAN_SLOTS` slots examined
     *   per call regardless of how few records match. On this path `cursor`
     *   is a shared-history-index slot, and **an empty page with
     *   `has_more: true` is expected** on sparse result sets — keep paging
     *   from `next_cursor` until it flips to `false`.
     *
     * In both paths `limit` is capped by the contract (25), gaps are reported
     * in `gaps_skipped`, and `has_more: false` terminates pagination.
     */
    getPaymentsByPayer(payer: string, cursor?: number, limit?: number): Promise<PaymentHistoryPage>;
    /**
     * Return `true` if the contract is currently paused (writes disabled).
     * Permissionless read.
     */
    isPaused(): Promise<boolean>;
    /**
     * Simulate, sign, submit, and await a write transaction with the configured
     * signer keypair. Shared by all admin-gated write operations.
     *
     * Time: O(k), k ≤ MAX_POLL_ATTEMPTS.
     */
    private submitWrite;
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