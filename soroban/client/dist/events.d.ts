import { xdr } from '@stellar/stellar-sdk';
/**
 * Schema version of the `invoice_payment_recorded` event payload that this
 * client knows how to decode. Mirrors `EVENT_SCHEMA_VERSION` in
 * `contracts/invoice-payment/src/events.rs` — bump both together when the
 * payload shape changes in a breaking way.
 */
export declare const EVENT_SCHEMA_VERSION = 1;
export type InvoicePaymentRecordedEvent = {
    type: 'invoice_payment_recorded';
    schemaVersion: number;
    invoiceId: string;
    payer: string;
    assetCode: string;
    assetIssuer: string;
    amount: bigint;
    settlementRef: string;
};
export type AssetAllowlistedEvent = {
    type: 'asset_allowlisted';
    code: string;
    issuer: string;
};
export type AssetRevokedEvent = {
    type: 'asset_revoked';
    code: string;
    issuer: string;
};
export type NativeAllowChangedEvent = {
    type: 'native_allow_changed';
    allowed: boolean;
};
export type StorageSchemaUpgradedEvent = {
    type: 'storage_schema_upgraded';
    fromVersion: number;
    toVersion: number;
    upgradedAt: bigint;
};
export type ContractPausedEvent = {
    type: 'contract_paused';
    paused: boolean;
    triggeredBy: string;
    timestamp: bigint;
};
export type AdminTransferProposedEvent = {
    type: 'admin_transfer_proposed';
    currentAdmin: string;
    newAdmin: string;
    timestamp: bigint;
};
export type AdminTransferAcceptedEvent = {
    type: 'admin_transfer_accepted';
    previousAdmin: string;
    newAdmin: string;
    timestamp: bigint;
};
export type ContractUpgradedEvent = {
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
export type UnknownSorobanEvent = {
    type: 'unknown';
    name?: string;
    reason: string;
};
export type DecodedSorobanEvent = InvoicePaymentRecordedEvent | AssetAllowlistedEvent | AssetRevokedEvent | NativeAllowChangedEvent | StorageSchemaUpgradedEvent | ContractPausedEvent | AdminTransferProposedEvent | AdminTransferAcceptedEvent | ContractUpgradedEvent | UnknownSorobanEvent;
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
//# sourceMappingURL=events.d.ts.map