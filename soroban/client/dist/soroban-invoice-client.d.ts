import { AllowlistPage, ContractConfig, PaymentHistoryPage, PaymentRecord, RecordPaymentParams, SettlementRefIndexStatus, SettlementRefPage, SorobanInvoiceClientConfig, TransactionResult } from './types';
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
 * | `getAllowlistCount` | O(1)                    | O(1) |
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
     * `params.invoiceId` and `params.settlementRef` must both be in
     * **canonical form** — lowercase letters, digits, and hyphens only, within
     * the contract's length bounds (`invoiceId` ≤ {@link MAX_INVOICE_ID_LEN},
     * `settlementRef` ≤ {@link MAX_SETTLEMENT_REF_LEN} chars) — mirroring the
     * `record_payment` guards on-chain. `settlementRef` is the normalised
     * settlement reference (e.g. a SHA-256 hash or reconciliation ID) used for
     * backend deduplication and idempotent reconciliation.
     *
     * Both fields are validated locally before the transaction is built, so a
     * non-canonical value fails fast with a plain `Error` instead of spending
     * a transaction on a simulation the contract would reject.
     *
     * ## Diagnosing a `SettlementRefAlreadyUsed` rejection
     * That rejection alone doesn't say whether it's a benign retry of an
     * already-successful attempt, or a genuine reconciliation conflict from a
     * different invoice claiming the same reference — call
     * {@link getSettlementRefOwner} with the same `settlementRef` and compare
     * the returned invoice ID to the one just attempted (issue #495).
     *
     * @throws {Error} if `invoiceId` or `settlementRef` is not canonical
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
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the
     * contract has been paused via `setPaused(true)` and has not yet been
     * unpaused. The admin-transfer control plane is frozen during incident
     * containment.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `PendingAdminExists`, `InvalidProposedAdmin`, `ContractPaused`)
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
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the
     * contract has been paused via `setPaused(true)` and has not yet been
     * unpaused. Even if a proposal was staged **before** the pause, acceptance
     * is still blocked — the operator has time to investigate and cancel the
     * proposal via `cancelAdminTransfer()` after unpausing.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NoPendingAdmin`, `Unauthorized`, `ContractPaused`)
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
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the contract
     * has been paused via `setPaused(true)`. The entire control plane — including
     * proposal cancellation — is frozen during containment so the operator can
     * inspect a stable state before unpausing and deciding whether to cancel.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NoPendingAdmin`, `Unauthorized`, `ContractPaused`)
     */
    cancelAdminTransfer(): Promise<TransactionResult>;
    /**
     * Add a `(code, issuer)` token pair to the admin-controlled allowlist.
     *
     * Only assets that have been allowlisted are accepted by `recordPayment`.
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     *
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the
     * contract has been paused via `setPaused(true)`. The asset allowlist is
     * part of the contract control plane and cannot be rewritten during
     * incident containment.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`, `ContractPaused`)
     */
    allowAsset(code: string, issuer: string): Promise<TransactionResult>;
    /**
     * Remove a `(code, issuer)` token pair from the allowlist.
     *
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     * Revoking an asset that was never allowlisted is a no-op on-chain.
     *
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the
     * contract has been paused via `setPaused(true)`. Revoking an asset is a
     * control-plane change that must not happen during the incident-
     * containment window; the operator needs a stable allowlist to reconcile
     * against while paused.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`, `ContractPaused`)
     */
    revokeAsset(code: string, issuer: string): Promise<TransactionResult>;
    /**
     * Toggle whether native XLM payments are accepted by `recordPayment`.
     *
     * The **contract admin** keypair must be provided via `signerSecretKey`.
     *
     * ## Paused
     * Throws `SorobanContractError` with code `ContractPaused` (12) if the
     * contract has been paused via `setPaused(true)`. Flipping the native-
     * asset policy would silently change which payments are accepted once
     * the contract is unpaused, so it is blocked alongside the other
     * allowlist mutators during containment.
     *
     * @throws {SorobanContractError} on contract-level rejection
     *   (e.g. `NotInitialized`, `Unauthorized`, `ContractPaused`)
     */
    setAllowNative(allowed: boolean): Promise<TransactionResult>;
    /**
     * Pause or unpause the contract (emergency stop / incident containment).
     *
     * When `setPaused(true)` is called, the contract enters a **containment
     * window** in which the following write methods are rejected with a
     * `SorobanContractError` whose `.code` is `ContractPaused` (12):
     *
     * | Method                  | Blocked when paused | Reason                                              |
     * |-------------------------|---------------------|-----------------------------------------------------|
     * | `recordPayment`         | blocked             | Payment log frozen during investigation            |
     * | `proposeAdmin`          | blocked             | Admin role cannot rotate out of containment         |
     * | `acceptAdmin`           | blocked             | Pending proposals cannot be claimed while paused    |
     * | `cancelAdminTransfer`   | blocked             | Control plane must remain stable during pause       |
     * | `allowAsset`            | blocked             | Allowlist cannot be added to while paused           |
     * | `revokeAsset`           | blocked             | Allowlist cannot be removed from while paused       |
     * | `setAllowNative`        | blocked             | Native-asset policy cannot flip while paused        |
     *
     * The following admin-gated methods are **intentionally exempt** and
     * remain callable while paused — they are either part of the upgrade
     * runbook (which REQUIRES pausing first) or recovery paths that must
     * work during containment:
     *
     * | Method                  | Available? | Rationale                                                                  |
     * |-------------------------|------------|----------------------------------------------------------------------------|
     * | `setPaused`             | yes        | Unpausing must be possible to lift the containment window                 |
     * | `upgrade`               | yes        | The WASM-upgrade runbook REQUIRES pausing first; see upgrade() docs       |
     * | `upgradeStorage`        | yes        | Storage migration runs between `upgrade()` and the final unpause          |
     * | `rebuildHistoryIndex`   | yes        | Administrative recovery; may run in the upgrade window or standalone     |
     *
     * **All read methods** (`getConfig`, `getAdmin`, `getPendingAdmin`,
     * `isPaused`, `getPayment`, `hasPayment`, `getPaymentCount`,
     * `getPaymentHistory`, `getPaymentsByPayer`, `getContractVersion`,
     * `getVersionInfo`, `getHistoryIndexStatus`) remain permissionless and
     * fully available while paused — auditing and investigation must never
     * be blocked by the emergency stop.
     *
     * The caller is derived from `signerSecretKey` and must match the
     * contract admin. Calling `setPaused(true)` when the contract is
     * **already** paused (and vice versa) is a true no-op: no storage
     * write and no `ContractPaused` event, so the event stream is a
     * faithful record of actual state transitions.
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
     * Resolve a settlement reference to the invoice ID that consumed it.
     *
     * Returns `null` when the reference is unused — a plain "not found"
     * result rather than an error, since an unused reference is a normal,
     * expected outcome for this read (issue #495).
     *
     * ## Disambiguating a `SettlementRefAlreadyUsed` rejection from `recordPayment`
     * Call this with the same `settlementRef` and compare the returned
     * invoice ID to the one just attempted: equal means a benign retry of an
     * already-successful anchoring attempt; different means a genuine
     * reconciliation conflict where another invoice already claimed the
     * reference.
     *
     * Permissionless read.
     */
    getSettlementRefOwner(settlementRef: string): Promise<string | null>;
    /**
     * Fetch a bounded page of the settlement-reference index in write order,
     * so operators can enumerate and audit every settlement reference ever
     * recorded (issue #495).
     *
     * `cursor` is the next write-order index to read; `limit` is capped by
     * the contract, mirroring `getPaymentHistory`. A missing index slot is
     * skipped and counted in `gapsSkipped` rather than stalling pagination —
     * keep paging from `nextCursor` until `hasMore` is `false`.
     */
    getSettlementRefHistory(cursor?: number, limit?: number): Promise<SettlementRefPage>;
    /**
     * Return a quick consistency summary for the settlement-reference index.
     *
     * `isConsistent` reads `false` when some payment's settlement reference
     * was never recorded — for example legacy data with an empty
     * `settlementRef`, or a duplicate reference migration deliberately left
     * unresolved rather than silently overwrite. Use `getSettlementRefHistory`
     * together with `getPaymentHistory` to find the affected payments.
     *
     * O(1) — only compares counters, does not walk every payment.
     * Permissionless read.
     */
    getSettlementRefIndexStatus(): Promise<SettlementRefIndexStatus>;
    /**
     * Fetch a bounded page of the currently-allowlisted `(code, issuer)`
     * pairs, so operators can enumerate and audit the allowlist without
     * already knowing which pairs to ask `isAssetAllowed`-style checks about
     * (issue #464).
     *
     * `cursor` is the next write-order slot to read; `limit` is capped by the
     * contract, mirroring `getPaymentHistory`/`getSettlementRefHistory`. A
     * revoked (or, on a legacy pre-migration deployment, not-yet-backfilled)
     * slot is skipped and counted in `gapsSkipped` rather than stalling
     * pagination — keep paging from `nextCursor` until `hasMore` is `false`.
     * Use `getAllowlistCount` to size paging or detect drift.
     *
     * Permissionless read.
     */
    getAllowedAssets(cursor?: number, limit?: number): Promise<AllowlistPage>;
    /**
     * Return the number of currently-allowlisted `(code, issuer)` pairs.
     *
     * Decrements on `revokeAsset`, unlike the enumeration log's own
     * write-order length — this always matches the number of entries
     * `getAllowedAssets` returns across a full scan, after any sequence of
     * adds and revokes (issue #464).
     *
     * O(1) — a stored counter, not a scan. Permissionless read.
     */
    getAllowlistCount(): Promise<number>;
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