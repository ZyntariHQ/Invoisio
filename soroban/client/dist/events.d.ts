import { xdr } from '@stellar/stellar-sdk';
/**
 * Schema version of the `invoice_payment_recorded` event payload that this
 * client knows how to decode. Mirrors `EVENT_SCHEMA_VERSION` in
 * `contracts/invoice-payment/src/events.rs` — bump both together when the
 * payload shape changes in a breaking way.
 */
export declare const EVENT_SCHEMA_VERSION = 2;
type VersionedEvent = {
    schemaVersion: number;
};
/**
 * As of issue #512 this event carries only `schemaVersion` and `invoiceId` —
 * no payer, asset, amount, asset_decimals, or settlement_ref. A public event
 * carrying the full record previously bypassed every read-method
 * access-control decision in the contract; a consumer that needs the full
 * record must already know `invoiceId` and call `getPayment(invoiceId)`.
 */
export type InvoicePaymentRecordedEvent = VersionedEvent & {
    type: 'invoice_payment_recorded';
    schemaVersion: number;
    invoiceId: string;
};
export type AssetAllowlistedEvent = VersionedEvent & {
    type: 'asset_allowlisted';
    code: string;
    issuer: string;
};
export type AssetRevokedEvent = VersionedEvent & {
    type: 'asset_revoked';
    code: string;
    issuer: string;
};
export type NativeAllowChangedEvent = VersionedEvent & {
    type: 'native_allow_changed';
    allowed: boolean;
};
export type StorageSchemaUpgradedEvent = VersionedEvent & {
    type: 'storage_schema_upgraded';
    fromVersion: number;
    toVersion: number;
    upgradedAt: bigint;
};
export type ContractPausedEvent = VersionedEvent & {
    type: 'contract_paused';
    paused: boolean;
    triggeredBy: string;
    timestamp: bigint;
};
export type AdminTransferProposedEvent = VersionedEvent & {
    type: 'admin_transfer_proposed';
    currentAdmin: string;
    newAdmin: string;
    timestamp: bigint;
};
export type AdminTransferAcceptedEvent = VersionedEvent & {
    type: 'admin_transfer_accepted';
    previousAdmin: string;
    newAdmin: string;
    timestamp: bigint;
};
export type ContractUpgradedEvent = VersionedEvent & {
    type: 'contract_upgraded';
    /** Packed semver of the code that was running when `upgrade()` was called. */
    previousVersion: number;
    /**
     * Caller-supplied packed semver of the code being deployed. Not verified
     * on-chain against `newWasmHash` — see `upgrade()`'s doc comment in
     * `contracts/invoice-payment/src/lib.rs`.
     */
    newVersion: number;
    /** Hex-encoded 32-byte hash of the newly installed WASM. */
    newWasmHash: string;
    upgradedBy: string;
    upgradedAt: bigint;
};
export type AdminTransferCancelledEvent = VersionedEvent & {
    type: 'admin_transfer_cancelled';
    currentAdmin: string;
    cancelledAdmin: string;
    timestamp: bigint;
};
export type HistoryIndexRebuiltEvent = VersionedEvent & {
    type: 'history_index_rebuilt';
    recordCount: number;
    rebuiltAt: bigint;
};
export type SettlementRefsMigratedEvent = VersionedEvent & {
    type: 'settlement_refs_migrated';
    count: number;
    conflictsSkipped: number;
    migratedAt: bigint;
};
export type AllowlistIndexBackfilledEvent = VersionedEvent & {
    type: 'allowlist_index_backfilled';
    discovered: number;
    migratedAt: bigint;
};
export type LegacyPaymentsMigratedEvent = VersionedEvent & {
    type: 'legacy_payments_migrated';
    migrated: number;
    migratedAt: bigint;
};
export type UnknownSorobanEvent = {
    type: 'unknown';
    name?: string;
    reason: string;
};
export type DecodedSorobanEvent = InvoicePaymentRecordedEvent | AssetAllowlistedEvent | AssetRevokedEvent | NativeAllowChangedEvent | StorageSchemaUpgradedEvent | ContractPausedEvent | AdminTransferProposedEvent | AdminTransferAcceptedEvent | ContractUpgradedEvent | AdminTransferCancelledEvent | HistoryIndexRebuiltEvent | SettlementRefsMigratedEvent | AllowlistIndexBackfilledEvent | LegacyPaymentsMigratedEvent | UnknownSorobanEvent;
/**
 * Shape of a contract event as delivered by the Soroban RPC `getEvents`
 * endpoint (or `SorobanRpc.Server.getEvents`). `topics` and `data` are
 * accepted either as decoded `xdr.ScVal` values or as the base64 XDR strings
 * the RPC returns, so both raw API payloads and pre-parsed ones work.
 */
export type SorobanEventInput = {
    topics: Array<xdr.ScVal | string>;
    data: xdr.ScVal | string;
};
/**
 * Decode one contract event into a stable application-level type.
 *
 * Never throws for unrecognized or malformed events — an indexer consuming a
 * ledger stream must keep going, so anything undecodable becomes
 * `{ type: 'unknown', reason }` with the event name preserved when the topic
 * could be read.
 *
 * Time:  O(1) per event. Space: O(1).
 */
export declare function decodeSorobanEvent(event: SorobanEventInput): DecodedSorobanEvent;
/**
 * Decode a batch of contract events, preserving input order.
 * Time: O(n). Space: O(n).
 */
export declare function decodeEventStream(events: SorobanEventInput[]): DecodedSorobanEvent[];
export {};
//# sourceMappingURL=events.d.ts.map