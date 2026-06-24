/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * This file is refreshed from the invoice-payment contract WASM spec.
 * Run `npm run generate:bindings` from `soroban/client/` to regenerate.
 */

export const CONTRACT_METHODS = [
  "initialize",
  "record_payment",
  "get_payment",
  "has_payment",
  "payment_count",
  "payment_history",
  "payments_by_payer",
  "config",
  "contract_version",
  "version_info",
  "admin",
  "set_admin",
  "allow_asset",
  "revoke_asset",
  "set_allow_native",
  "upgrade_storage"
] as const;

export type ContractMethodName = (typeof CONTRACT_METHODS)[number];

export interface ContractMethodParameter {
  readonly name: string;
  readonly type: string;
}

export interface ContractMethodSignature {
  readonly name: ContractMethodName;
  readonly params: readonly ContractMethodParameter[];
  readonly returnType: string;
}

export const CONTRACT_METHOD_SIGNATURES = [
  {
    name: 'initialize',
    params: [
      {
        name: 'admin',
        type: 'Address',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'record_payment',
    params: [
      {
        name: 'invoice_id',
        type: 'String',
      },
      {
        name: 'payer',
        type: 'Address',
      },
      {
        name: 'asset_code',
        type: 'String',
      },
      {
        name: 'asset_issuer',
        type: 'String',
      },
      {
        name: 'amount',
        type: 'i128',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'get_payment',
    params: [
      {
        name: 'invoice_id',
        type: 'String',
      }
    ],
    returnType: 'Result<PaymentRecord, ContractError>',
  },
  {
    name: 'has_payment',
    params: [
      {
        name: 'invoice_id',
        type: 'String',
      }
    ],
    returnType: 'bool',
  },
  {
    name: 'payment_count',
    params: [],
    returnType: 'u32',
  },
  {
    name: 'payment_history',
    params: [
      {
        name: 'cursor',
        type: 'u32',
      },
      {
        name: 'limit',
        type: 'u32',
      }
    ],
    returnType: 'PaymentHistoryPage',
  },
  {
    name: 'payments_by_payer',
    params: [
      {
        name: 'payer',
        type: 'Address',
      },
      {
        name: 'cursor',
        type: 'u32',
      },
      {
        name: 'limit',
        type: 'u32',
      }
    ],
    returnType: 'PaymentHistoryPage',
  },
  {
    name: 'config',
    params: [],
    returnType: 'ContractConfig',
  },
  {
    name: 'contract_version',
    params: [],
    returnType: 'u32',
  },
  {
    name: 'version_info',
    params: [],
    returnType: 'ContractMeta',
  },
  {
    name: 'admin',
    params: [],
    returnType: 'Result<Address, ContractError>',
  },
  {
    name: 'set_admin',
    params: [
      {
        name: 'new_admin',
        type: 'Address',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'allow_asset',
    params: [
      {
        name: 'code',
        type: 'String',
      },
      {
        name: 'issuer',
        type: 'String',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'revoke_asset',
    params: [
      {
        name: 'code',
        type: 'String',
      },
      {
        name: 'issuer',
        type: 'String',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'set_allow_native',
    params: [
      {
        name: 'allowed',
        type: 'bool',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
  {
    name: 'upgrade_storage',
    params: [
      {
        name: 'caller',
        type: 'Address',
      }
    ],
    returnType: 'Result<(), ContractError>',
  },
] as const;

export interface AssetNative {
  readonly type: 'native';
}

export interface AssetToken {
  readonly type: 'token';
  /** Token code, e.g. "USDC" */
  readonly code: string;
  /** Issuer Stellar address (G...) */
  readonly issuer: string;
}

export type Asset = AssetNative | AssetToken;

export interface ContractMeta {
  /** Contract code version that most recently wrote state. */
  readonly contract_version: number;
  /** Storage layout/schema version in this contract instance. */
  readonly storage_schema_version: number;
}

export interface PaymentRecord {
  /** Unique invoice identifier, e.g. "invoisio-abc123" */
  readonly invoiceId: string;
  /** Stellar account (G...) that made the payment */
  readonly payer: string;
  readonly asset: Asset;
  /**
   * Amount in smallest denomination.
   * - XLM: stroops - 1 XLM = 10_000_000 stroops
   * - Token: 7-decimal units - 1 USDC = 10_000_000 units
   */
  readonly amount: bigint;
  /** Unix seconds at which the ledger included this record */
  readonly timestamp: bigint;
}

export const CONTRACT_ERROR_CODES = {
  1: 'AlreadyInitialized',
  2: 'NotInitialized',
  3: 'PaymentAlreadyRecorded',
  4: 'PaymentNotFound',
  5: 'InvalidAmount',
  6: 'InvalidInvoiceId',
  7: 'InvalidAsset',
  8: 'AssetNotAllowed',
  9: 'Unauthorized',
  10: 'StorageSchemaTooNew',
  11: 'StorageSchemaTooOld',
} as const;

export type ContractErrorCode =
  | (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES]
  | 'Unknown';
