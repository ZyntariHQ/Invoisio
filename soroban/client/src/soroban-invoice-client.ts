import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  rpc,
  Transaction,
  TransactionBuilder,
  xdr,
  scValToNative,
} from '@stellar/stellar-sdk';

import {
  ContractConfig,
  AllowedAssetEntry,
  AllowlistPage,
  PaymentHistoryPage,
  PaymentRecord,
  RecordPaymentParams,
  SorobanInvoiceClientConfig,
  TransactionResult,
} from './types';
import {
  decodeContractConfig,
  decodePaymentRecord,
  decodePaymentHistoryPage,
  decodeAllowlistPage,
  encodeAddress,
  encodeBool,
  encodeI128,
  encodeString,
  encodeU32,
  parseContractError,
} from './codec';

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
 * | Method                   | Time                       | Space |
 * |--------------------------|----------------------------|-------|
 * | `recordPayment`          | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `getPayment`             | O(1)                       | O(1) |
 * | `hasPayment`             | O(1)                       | O(1) |
 * | `getPaymentCount`        | O(1)                       | O(1) |
 * | `allowAsset`             | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `revokeAsset`            | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `setAllowNative`         | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `setPaused`              | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 * | `getAdmin`               | O(1)                       | O(1) |
 * | `isPaused`               | O(1)                       | O(1) |
 * | `listAssets`             | O(1)                       | O(p) |
 * | `getAllowlistCount`       | O(1)                       | O(1) |
 * | `rebuildAllowlistIndex`  | O(k), k ≤ MAX_POLL_ATTEMPTS | O(1) |
 *
 * Read methods use `new Account(pk, '0')` instead of `server.getAccount()`.
 * Simulation does not validate the sequence number, so this saves one
 * full network round-trip per read call.
 */
export class SorobanInvoiceClient {
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly config: SorobanInvoiceClientConfig;
  /** Cached keypair — derived once at construction, not re-derived per call. */
  private readonly keypair: Keypair | undefined;

  constructor(config: SorobanInvoiceClientConfig) {
    if (!config.signerSecretKey && !config.sourcePublicKey) {
      throw new Error(
        'SorobanInvoiceClient requires either signerSecretKey or sourcePublicKey',
      );
    }

    this.config = config;
    // Created once; underlying HTTP connection is reused across all calls.
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.contractId);
    // Parse the keypair once — elliptic curve derivation is not free.
    this.keypair = config.signerSecretKey
      ? Keypair.fromSecret(config.signerSecretKey)
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
   * `params.settlementRef` is the normalised settlement reference (e.g. a
   * SHA-256 hash or reconciliation ID) used for backend deduplication and
   * idempotent reconciliation. It must be non-empty and at most 128 chars —
   * the contract rejects longer values with `InvalidSettlementRef`.
   *
   * @throws {SorobanContractError} on contract-level rejection
   *   (e.g. `PaymentAlreadyRecorded`, `InvalidAmount`, `InvalidSettlementRef`)
   * @throws {Error} on network errors or confirmation timeout
   */
  async recordPayment(params: RecordPaymentParams): Promise<TransactionResult> {
    this.requireSigner();

    // server.getAccount() is needed here: submitted transactions must carry
    // the correct on-chain sequence number to prevent replay attacks.
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'record_payment',
          encodeString(params.invoiceId),
          encodeAddress(params.payer),
          encodeString(params.assetCode),
          encodeString(params.assetIssuer),
          encodeI128(params.amount),
          encodeString(params.settlementRef),
        ),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

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
  async proposeAdmin(newAdmin: string): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.contract.call('propose_admin', encodeAddress(newAdmin)))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

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
  async acceptAdmin(): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());
    const caller = this.keypair!.publicKey();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.contract.call('accept_admin', encodeAddress(caller)))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

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
  async cancelAdminTransfer(): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.contract.call('cancel_admin_transfer'))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  /**
   * Add a `(code, issuer)` token pair to the admin-controlled allowlist.
   *
   * Only assets that have been allowlisted are accepted by `recordPayment`.
   * The **contract admin** keypair must be provided via `signerSecretKey`.
   *
   * @throws {SorobanContractError} on contract-level rejection
   *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`)
   */
  async allowAsset(code: string, issuer: string): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call('allow_asset', encodeString(code), encodeString(issuer)),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  /**
   * Remove a `(code, issuer)` token pair from the allowlist.
   *
   * The **contract admin** keypair must be provided via `signerSecretKey`.
   *
   * @throws {SorobanContractError} with code `AssetNotFound` when the pair
   *   was never in the allowlist — distinguishing a no-op from a real removal.
   * @throws {SorobanContractError} on other contract-level rejections
   *   (e.g. `NotInitialized`, `InvalidAsset`, `Unauthorized`)
   */
  async revokeAsset(code: string, issuer: string): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call('revoke_asset', encodeString(code), encodeString(issuer)),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  /**
   * Toggle whether native XLM payments are accepted by `recordPayment`.
   *
   * The **contract admin** keypair must be provided via `signerSecretKey`.
   *
   * @throws {SorobanContractError} on contract-level rejection
   *   (e.g. `NotInitialized`, `Unauthorized`)
   */
  async setAllowNative(allowed: boolean): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.contract.call('set_allow_native', encodeBool(allowed)))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

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
  async setPaused(paused: boolean): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());
    const caller = this.keypair!.publicKey();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call('set_paused', encodeAddress(caller), encodeBool(paused)),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  /**
   * Bulk extend the TTLs for the payment log, history index, and specific
   * payment records within a given bounded range.
   * 
   * The **contract admin** keypair must be provided via `signerSecretKey`.
   *
   * @param startIndex Zero-based start index (inclusive).
   * @param endIndex Zero-based end index (exclusive).
   * @throws {SorobanContractError} on contract-level rejection
   */
  async extendHistoryTtl(
    startIndex: number,
    endIndex: number,
  ): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());
    const caller = this.keypair!.publicKey();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'extend_history_ttl',
          encodeAddress(caller),
          encodeU32(startIndex),
          encodeU32(endIndex),
        ),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  // ─── Read operations (permissionless) ──────────────────────────────────────

  /**
   * Return the stable high-level contract configuration snapshot.
   *
   * This is the preferred single-call read for deployment checks, backend
   * health probes, and UI bootstrapping because it includes admin ownership,
   * initialization status, version metadata, and allowlist policy together.
   */
  async getConfig(): Promise<ContractConfig> {
    const retval = await this.simulateView('config');
    return decodeContractConfig(retval);
  }

  /**
   * Return the current contract admin address. Permissionless read.
   *
   * @throws {SorobanContractError} with code `NotInitialized` if the contract
   *   has not been initialised yet.
   */
  async getAdmin(): Promise<string> {
    const retval = await this.simulateView('admin');
    return String(scValToNative(retval));
  }

  /**
   * Return the address currently proposed as the next admin, or `null` when no
   * admin transfer is in flight. Permissionless read.
   */
  async getPendingAdmin(): Promise<string | null> {
    const retval = await this.simulateView('pending_admin');
    const native = scValToNative(retval);
    return native === null || native === undefined ? null : String(native);
  }

  /**
   * Fetch the full `PaymentRecord` for an invoice.
   *
   * @throws {SorobanContractError} with code `PaymentNotFound` if not recorded
   */
  async getPayment(invoiceId: string): Promise<PaymentRecord> {
    const retval = await this.simulateView('get_payment', encodeString(invoiceId));
    return decodePaymentRecord(retval);
  }

  /**
   * Return `true` if a payment has been recorded for the given invoice ID.
   * Use this as an idempotency check before calling `recordPayment`.
   */
  async hasPayment(invoiceId: string): Promise<boolean> {
    const retval = await this.simulateView('has_payment', encodeString(invoiceId));
    return Boolean(scValToNative(retval));
  }

  /**
   * Return the total number of payments recorded in this contract instance.
   */
  async getPaymentCount(): Promise<number> {
    const retval = await this.simulateView('payment_count');
    return Number(scValToNative(retval));
  }

  /**
   * Fetch a bounded page of payment history using a cursor-based read.
   *
   * `cursor` is the next history index to read, and `limit` is capped by the
   * contract so responses remain bounded and predictable.
   */
  async getPaymentHistory(cursor = 0, limit = 25): Promise<PaymentHistoryPage> {
    const retval = await this.simulateView(
      'payment_history',
      encodeU32(cursor),
      encodeU32(limit),
    );
    return decodePaymentHistoryPage(retval);
  }

  /**
   * Return `true` if the contract is currently paused (writes disabled).
   * Permissionless read.
   */
  async isPaused(): Promise<boolean> {
    const retval = await this.simulateView('is_paused');
    return Boolean(scValToNative(retval));
  }

  /**
   * Return a paginated slice of the allowlisted `(code, issuer)` asset pairs.
   *
   * Permissionless read — no admin keypair required.
   *
   * @param cursor  Zero-based slot index to start from (default `0`).
   * @param limit   Maximum entries per page (capped at 25 by the contract).
   */
  async listAssets(cursor = 0, limit = 25): Promise<AllowlistPage> {
    const retval = await this.simulateView(
      'list_assets',
      encodeU32(cursor),
      encodeU32(limit),
    );
    return decodeAllowlistPage(retval);
  }

  /**
   * Return the total number of allowlisted asset pairs.
   *
   * Permissionless read. Consistent with the enumeration returned by
   * `listAssets`: `count === (await listAssets(0, count)).total`.
   */
  async getAllowlistCount(): Promise<number> {
    const retval = await this.simulateView('allowlist_count');
    return Number(scValToNative(retval));
  }

  /**
   * Rebuild the enumerable allowlist index for legacy deployments.
   *
   * Call once after upgrading a deployment that predates this contract version.
   * Supply the complete list of `(code, issuer)` pairs that were previously
   * allowlisted. Entries whose on-chain existence sentinel is absent are
   * silently dropped.
   *
   * The **contract admin** keypair must be provided via `signerSecretKey`.
   *
   * @throws {SorobanContractError} with code `Unauthorized` if caller is not admin.
   */
  async rebuildAllowlistIndex(pairs: AllowedAssetEntry[]): Promise<TransactionResult> {
    this.requireSigner();
    const account = await this.server.getAccount(this.keypair!.publicKey());
    const caller = this.keypair!.publicKey();

    const pairsEncoded = pairs.map((p) =>
      // Each entry is a Soroban struct with two string fields.
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('code'),
          val: encodeString(p.code),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('issuer'),
          val: encodeString(p.issuer),
        }),
      ]),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'rebuild_allowlist_index',
          encodeAddress(caller),
          xdr.ScVal.scvVec(pairsEncoded),
        ),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    return this.submitWrite(tx);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Simulate, sign, submit, and await a write transaction with the configured
   * signer keypair. Shared by all admin-gated write operations.
   *
   * Time: O(k), k ≤ MAX_POLL_ATTEMPTS.
   */
  private async submitWrite(tx: Transaction): Promise<TransactionResult> {
    // prepareTransaction simulates and assembles the fee + storage footprint.
    // It throws if the simulation fails (e.g. contract returns Err(...)).
    let prepared: Transaction;
    try {
      prepared = await this.server.prepareTransaction(tx);
    } catch (err) {
      throw parseContractError(err instanceof Error ? err.message : String(err));
    }

    prepared.sign(this.keypair!);

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === 'ERROR') {
      const detail = sendResult.errorResult?.toXDR('base64') ?? 'unknown';
      throw new Error(`Transaction rejected by network: ${detail}`);
    }

    return this.awaitTransaction(sendResult.hash);
  }

  /**
   * Build and simulate a read-only contract call without submitting a transaction.
   *
   * Uses `new Account(pk, '0')` instead of `server.getAccount()` because
   * Soroban simulation does not validate the sequence number — this saves one
   * network round-trip per read call.
   *
   * Time: O(1) — single RPC round-trip.
   */
  private async simulateView(method: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
    // Sequence '0' is intentional: simulation ignores it.
    const account = new Account(this.resolveSourcePublicKey(), '0');

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(result)) {
      throw parseContractError(result.error);
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
  private async awaitTransaction(hash: string): Promise<TransactionResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const result = await this.server.getTransaction(hash);

      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash, ledger: result.ledger };
      }

      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed on-chain: ${hash}`);
      }

      // NOT_FOUND → not yet included in a ledger; sleep and retry.
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `Transaction ${hash} not confirmed after ${MAX_POLL_ATTEMPTS} polls ` +
        `(${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1_000} s)`,
    );
  }

  private resolveSourcePublicKey(): string {
    return this.keypair?.publicKey() ?? this.config.sourcePublicKey!;
  }

  private requireSigner(): void {
    if (!this.keypair) {
      throw new Error('signerSecretKey is required for write operations');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
