import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(clientDir, '..', '..');
const workspaceManifest = path.resolve(repoRoot, 'soroban', 'Cargo.toml');
const wasmPath = path.resolve(
  repoRoot,
  'soroban',
  'target',
  'wasm32v1-none',
  'release',
  'invoice_payment.wasm',
);
const outputPath = path.resolve(clientDir, 'src', 'generated', 'invoice-payment-bindings.ts');
const helperManifest = path.resolve(
  repoRoot,
  'soroban',
  'tools',
  'bindings-gen',
  'Cargo.toml',
);

const checkOnly = process.argv.includes('--check');

async function main() {
  await execFileAsync(
    'cargo',
    [
      'build',
      '--manifest-path',
      workspaceManifest,
      '--target',
      'wasm32v1-none',
      '--release',
      '-p',
      'invoice-payment',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const wasm = await fs.readFile(wasmPath);

  const { stdout } = await execFileAsync(
    'cargo',
    [
      'run',
      '--quiet',
      '--manifest-path',
      helperManifest,
      '--',
      '--wasm',
      wasmPath,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const generated = renderBindings(stdout.trimEnd());

  if (checkOnly) {
    const current = await fs.readFile(outputPath, 'utf8').catch(() => null);
    if (current !== generated) {
      process.stderr.write(`Binding drift detected in ${path.relative(repoRoot, outputPath)}\n`);
      process.exit(1);
    }
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${generated}\n`, 'utf8');
}

function renderBindings(rustSource) {
  const methods = extractMethods(rustSource);
  const contractMeta = extractStruct(rustSource, 'ContractMeta');
  const paymentRecord = extractStruct(rustSource, 'PaymentRecord');
  const asset = extractEnum(rustSource, 'Asset');
  const contractErrors = extractEnum(rustSource, 'ContractError');

  validateExpectedMethods(methods);
  validateExpectedStruct(contractMeta, ['contract_version', 'storage_schema_version']);
  validateExpectedStruct(paymentRecord, ['invoice_id', 'payer', 'asset', 'amount', 'timestamp']);
  validateExpectedEnum(asset, ['Native', 'Token']);
  validateExpectedEnum(contractErrors, [
    'AlreadyInitialized',
    'NotInitialized',
    'PaymentAlreadyRecorded',
    'PaymentNotFound',
    'InvalidAmount',
    'InvalidInvoiceId',
    'InvalidAsset',
    'AssetNotAllowed',
    'Unauthorized',
    'StorageSchemaTooNew',
    'StorageSchemaTooOld',
  ]);

  const contractErrorCodes = contractErrors
    .map((variant) => `  ${variant.value}: '${variant.name}',`)
    .join('\n');
  const contractMethodSignatures = methods.map(formatMethodSignature).join('\n');

  return `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * This file is refreshed from the invoice-payment contract WASM spec.
 * Run \`npm run generate:bindings\` from \`soroban/client/\` to regenerate.
 */

export const CONTRACT_METHODS = ${JSON.stringify(methods.map((entry) => entry.name), null, 2)} as const;

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
${contractMethodSignatures}
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
  readonly contract_version: ${mapType(contractMeta.fields[0].type)};
  /** Storage layout/schema version in this contract instance. */
  readonly storage_schema_version: ${mapType(contractMeta.fields[1].type)};
}

export interface PaymentRecord {
  /** Unique invoice identifier, e.g. "invoisio-abc123" */
  readonly invoiceId: ${mapType(paymentRecord.fields[0].type)};
  /** Stellar account (G...) that made the payment */
  readonly payer: ${mapType(paymentRecord.fields[1].type)};
  readonly asset: ${mapType(paymentRecord.fields[2].type)};
  /**
   * Amount in smallest denomination.
   * - XLM: stroops - 1 XLM = 10_000_000 stroops
   * - Token: 7-decimal units - 1 USDC = 10_000_000 units
   */
  readonly amount: ${mapType(paymentRecord.fields[3].type)};
  /** Unix seconds at which the ledger included this record */
  readonly timestamp: ${mapType(paymentRecord.fields[4].type)};
}

export const CONTRACT_ERROR_CODES = {
${contractErrorCodes}
} as const;

export type ContractErrorCode =
  | (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES]
  | 'Unknown';
`;
}

function extractMethods(source) {
  const block = extractBlock(source, 'pub trait Contract {');
  const methods = [];

  const methodRegex = /fn\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^;]*?))?;/g;
  let match;

  while ((match = methodRegex.exec(block)) !== null) {
    const name = match[1];
    const paramsText = match[2];
    const returnTypeRaw = match[3];
    const returnType = returnTypeRaw ? returnTypeRaw.trim().replace(/\s+/g, ' ') : '()';

    const params = splitTopLevel(paramsText)
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter((part) => part.length > 0)
      .map((part) => {
        const colonIndex = part.indexOf(':');
        if (colonIndex === -1) {
          return null;
        }
        const paramName = part.slice(0, colonIndex).trim();
        const paramType = part.slice(colonIndex + 1).trim();
        if (paramName === 'env') {
          return null;
        }
        return { name: paramName, type: paramType };
      })
      .filter(Boolean);

    methods.push({
      name,
      params,
      returnType,
    });
  }

  return methods;
}

function extractStruct(source, structName) {
  const block = extractBlock(source, `pub struct ${structName} {`);
  const fields = [];

  for (const line of block.split('\n')) {
    const match = line.trim().match(/^pub\s+([a-zA-Z0-9_]+):\s*(.*),$/);
    if (!match) {
      continue;
    }

    fields.push({
      name: match[1],
      type: match[2],
    });
  }

  return { name: structName, fields };
}

function extractEnum(source, enumName) {
  const block = extractBlock(source, `pub enum ${enumName} {`);
  const variants = [];

  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '}' || trimmed.startsWith('#[')) {
      continue;
    }

    const valueMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(\d+),$/);
    if (valueMatch) {
      variants.push({
        name: valueMatch[1],
        value: Number(valueMatch[2]),
      });
      continue;
    }

    const tupleMatch = trimmed.match(/^([A-Za-z0-9_]+)\((.*)\),$/);
    if (tupleMatch) {
      variants.push({
        name: tupleMatch[1],
        fields: splitTopLevel(tupleMatch[2]).map((value) => value.trim()),
      });
      continue;
    }

    const unitMatch = trimmed.match(/^([A-Za-z0-9_]+),$/);
    if (unitMatch) {
      variants.push({
        name: unitMatch[1],
      });
    }
  }

  return { name: enumName, variants };
}

function extractBlock(source, header) {
  const start = source.indexOf(header);
  if (start === -1) {
    throw new Error(`Could not find ${header}`);
  }

  const openIndex = source.indexOf('{', start);
  if (openIndex === -1) {
    throw new Error(`Could not find opening brace for ${header}`);
  }

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }

  throw new Error(`Could not find closing brace for ${header}`);
}

function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (const char of text) {
    if (char === '<' || char === '(' || char === '[') {
      depth += 1;
    } else if (char === '>' || char === ')' || char === ']') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

function validateExpectedMethods(methods) {
  const expected = [
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
    'payment_history',
    'payments_by_payer',
    'config',
    'upgrade_storage',
  ].sort();

  const actual = methods.map((entry) => entry.name).sort();
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error(`Unexpected contract methods: ${actual.join(', ')}`);
  }
}

function validateExpectedStruct(structDef, expectedFields) {
  const actual = structDef.fields.map((field) => field.name).sort();
  const expected = [...expectedFields].sort();
  if (
    expected.length !== actual.length ||
    expected.some((name, index) => name !== actual[index])
  ) {
    throw new Error(`Unexpected ${structDef.name} fields: ${actual.join(', ')}`);
  }
}

function validateExpectedEnum(enumDef, expectedVariants) {
  const actual = enumDef.variants.map((variant) => variant.name).sort();
  const expected = [...expectedVariants].sort();
  if (
    expected.length !== actual.length ||
    expected.some((name, index) => name !== actual[index])
  ) {
    throw new Error(`Unexpected ${enumDef.name} variants: ${actual.join(', ')}`);
  }
}

function formatMethodSignature(method) {
  const params = method.params.length > 0 ? formatParams(method.params) : '[]';

  return `  {
    name: '${method.name}',
    params: ${params},
    returnType: '${method.returnType}',
  },`;
}

function formatParams(params) {
  const rendered = params
    .map((param, index) => {
      const suffix = index === params.length - 1 ? '' : ',';
      return `      {
        name: '${param.name}',
        type: '${param.type}',
      }${suffix}`;
    })
    .join('\n');

  return `[\n${rendered}\n    ]`;
}

function mapType(type) {
  const normalized = type.replace(/^soroban_sdk::/, '');

  switch (normalized) {
    case 'String':
    case 'Address':
      return 'string';
    case 'u32':
      return 'number';
    case 'u64':
    case 'i128':
      return 'bigint';
    case 'bool':
      return 'boolean';
    case 'Asset':
      return 'Asset';
    case 'ContractMeta':
      return 'ContractMeta';
    default:
      return normalized;
  }
}

await main();
