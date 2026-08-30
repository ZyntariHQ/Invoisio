import { xdr } from '@stellar/stellar-sdk';
export declare const EVENT_SCHEMA_VERSION = 2;
type VersionedEvent = {
    schemaVersion: number;
};
export type InvoicePaymentRecordedEvent = VersionedEvent & {
    type: 'invoice_payment_recorded';
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
export type AdminTransferCancelledEvent = VersionedEvent & {
    type: 'admin_transfer_cancelled';
    currentAdmin: string;
    cancelledAdmin: string;
    timestamp: bigint;
};
export type ContractUpgradedEvent = VersionedEvent & {
    type: 'contract_upgraded';
    previousVersion: number;
    newVersion: number;
    newWasmHash: string;
    upgradedBy: string;
    upgradedAt: bigint;
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
export type IssuersMigratedEvent = {
    type: 'issuers_migrated';
    payments: number;
    allowlist: number;
    skippedMalformed: number;
    migratedAt: bigint;
};
export type UnknownSorobanEvent = {
    type: 'unknown';
    name?: string;
    reason: string;
};
export type DecodedSorobanEvent = InvoicePaymentRecordedEvent | AssetAllowlistedEvent | AssetRevokedEvent | NativeAllowChangedEvent | StorageSchemaUpgradedEvent | ContractPausedEvent | AdminTransferProposedEvent | AdminTransferAcceptedEvent | AdminTransferCancelledEvent | ContractUpgradedEvent | HistoryIndexRebuiltEvent | SettlementRefsMigratedEvent | AllowlistIndexBackfilledEvent | LegacyPaymentsMigratedEvent | IssuersMigratedEvent | UnknownSorobanEvent;
export type SorobanEventInput = {
    topics: Array<xdr.ScVal | string>;
    data: xdr.ScVal | string;
};
export declare function decodeSorobanEvent(event: SorobanEventInput): DecodedSorobanEvent;
export declare function decodeEventStream(events: SorobanEventInput[]): DecodedSorobanEvent[];
export {};
//# sourceMappingURL=events.d.ts.map