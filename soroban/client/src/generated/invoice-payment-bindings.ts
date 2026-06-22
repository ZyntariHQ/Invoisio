/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * This file is refreshed from the invoice-payment contract WASM spec.
 * Run `npm run generate:bindings` from `soroban/client/` to regenerate.
 */

export const CONTRACT_METHODS = [
  'initialize',
  'record_payment',
  'get_payment',
  'has_payment',
  'payment_count',
  'contract_version',
  'version_info',
  'admin',
  'set_admin',
  'allow_asset',
  'revoke_asset',
  'set_allow_native',
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
] as const;

export interface AssetNative {
  readonly type: 'native';
}

export interface AssetToken {
  readonly type: 'token';
  readonly code: string;
  readonly issuer: string;
}

export type Asset = AssetNative | AssetToken;

export interface ContractMeta {
  readonly contract_version: number;
  readonly storage_schema_version: number;
}

export interface PaymentRecord {
  readonly invoiceId: string;
  readonly payer: string;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly timestamp: bigint;
}

/** Numeric codes matching the Rust `ContractError` enum. */
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
} as const;

export type ContractErrorCode =
  | (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES]
  | 'Unknown';
