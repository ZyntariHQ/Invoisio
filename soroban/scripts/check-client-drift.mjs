#!/usr/bin/env node
// check-client-drift.mjs — fail CI when the checked-in TypeScript client
// (soroban/client/) no longer matches the contract schema (schema.json).
//
// schema.json is itself generated from the Rust contract source by
// `generate-schema.sh` (see that script's own self-verification against
// src/errors.rs and src/lib.rs), so this script only needs to compare the
// TS client against schema.json to transitively catch contract-client
// drift.
//
// Run locally:
//   node soroban/scripts/check-client-drift.mjs
//
// Checks:
//   1. Every error in client/src/error-manifest.ts has the same {code, name}
//      as schema.json's `errors`, and vice versa (no missing/extra/renamed
//      codes on either side).
//   2. Every contract method name the client actually calls (via
//      `contract.call(...)` / `simulateView(...)`) exists in schema.json's
//      `methods` (catches a renamed/removed contract method the client
//      still calls by its old name).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOROBAN_DIR = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(SOROBAN_DIR, 'contracts/invoice-payment/schema.json');
const ERROR_MANIFEST_PATH = path.join(SOROBAN_DIR, 'client/src/error-manifest.ts');
const CLIENT_PATH = path.join(SOROBAN_DIR, 'client/src/soroban-invoice-client.ts');
const EVENTS_RS_PATH = path.join(SOROBAN_DIR, 'contracts/invoice-payment/src/events.rs');
const EVENTS_CLIENT_PATH = path.join(SOROBAN_DIR, 'client/src/events.ts');

const failures = [];
const fail = (msg) => failures.push(msg);

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const errorManifestSrc = readFileSync(ERROR_MANIFEST_PATH, 'utf8');
const clientSrc = readFileSync(CLIENT_PATH, 'utf8');
const eventsRsSrc = readFileSync(EVENTS_RS_PATH, 'utf8');
const eventsClientSrc = readFileSync(EVENTS_CLIENT_PATH, 'utf8');

// ─── 1. error-manifest.ts vs schema.json errors ─────────────────────────────

const manifestEntryRe = /code:\s*(\d+),\s*\n\s*name:\s*'([^']+)'/g;
const manifestErrors = new Map();
for (const match of errorManifestSrc.matchAll(manifestEntryRe)) {
  manifestErrors.set(match[2], Number(match[1]));
}
if (manifestErrors.size === 0) {
  fail(`error-manifest.ts: found no {code, name} entries — regex out of date, or CONTRACT_ERROR_MANIFEST is empty?`);
}

const schemaErrors = new Map(Object.entries(schema.errors ?? {}).map(([name, v]) => [name, v.code]));

for (const [name, code] of manifestErrors) {
  if (!schemaErrors.has(name)) {
    fail(
      `error-manifest.ts declares error '${name}' (code ${code}) which is not in schema.json.\n` +
        `    Either the contract no longer defines this error (remove it from error-manifest.ts and\n` +
        `    error-manifest.test.ts), or schema.json is stale — run: make schema`,
    );
  } else if (schemaErrors.get(name) !== code) {
    fail(
      `error-manifest.ts has '${name}' = ${code}, but schema.json has it as ${schemaErrors.get(name)}.\n` +
        `    Error codes must never be renumbered once deployed — fix whichever side is wrong.`,
    );
  }
}
for (const [name, code] of schemaErrors) {
  if (!manifestErrors.has(name)) {
    fail(
      `schema.json declares error '${name}' (code ${code}) which is missing from client/src/error-manifest.ts.\n` +
        `    Add a matching entry to CONTRACT_ERROR_MANIFEST (see the "Evolving the manifest" comment\n` +
        `    at the top of error-manifest.ts) and cover it in error-manifest.test.ts.`,
    );
  }
}

// ─── 2. Method names the client calls vs schema.json methods ───────────────

const callRe = /(?:this\.contract\.call|this\.simulateView)\(\s*\n?\s*'([a-z_]+)'/g;
const calledMethods = new Set();
for (const match of clientSrc.matchAll(callRe)) {
  calledMethods.add(match[1]);
}
if (calledMethods.size === 0) {
  fail(`soroban-invoice-client.ts: found no contract.call/simulateView method names — regex out of date?`);
}

const schemaMethods = new Set(Object.keys(schema.methods ?? {}));

for (const name of calledMethods) {
  if (!schemaMethods.has(name)) {
    fail(
      `soroban-invoice-client.ts calls contract method '${name}', which is not in schema.json's methods.\n` +
        `    Either the contract method was renamed/removed (update soroban-invoice-client.ts), or\n` +
        `    schema.json is stale — run: make schema`,
    );
  }
}

// ─── 3. Event payload ABI: Rust declaration order <-> schema <-> TS client ─

const rustEvents = new Map();
const rustEventRe = /#\[contractevent\][\s\S]*?pub struct (\w+) \{([\s\S]*?)\n\}/g;
for (const match of eventsRsSrc.matchAll(rustEventRe)) {
  const fields = [...match[2].matchAll(/^\s*pub (\w+):/gm)].map((field) => field[1]);
  rustEvents.set(match[1], fields);
}
if (rustEvents.size === 0) fail('events.rs: found no #[contractevent] structs — event parser out of date?');

const schemaEvents = schema.events ?? {};
for (const [name, rustFields] of rustEvents) {
  const schemaEvent = schemaEvents[name];
  if (!schemaEvent) {
    fail(`schema.json is missing contract event '${name}'.`);
    continue;
  }
  const schemaFields = Object.keys(schemaEvent.fields ?? {});
  if (JSON.stringify(rustFields) !== JSON.stringify(schemaFields)) {
    fail(
      `event '${name}' field order drift: Rust=[${rustFields.join(', ')}], ` +
        `schema.json=[${schemaFields.join(', ')}]. Event field order is ABI and requires a schema version bump.`,
    );
  }
}
for (const name of Object.keys(schemaEvents)) {
  if (!rustEvents.has(name)) fail(`schema.json declares stale contract event '${name}'.`);
}

const clientEventNames = new Set([...eventsClientSrc.matchAll(/type:\s*'([a-z_]+)'/g)].map((match) => match[1]));
for (const schemaEvent of Object.values(schemaEvents)) {
  if (!clientEventNames.has(schemaEvent.topic)) {
    fail(`client/src/events.ts is missing decoder coverage for event topic '${schemaEvent.topic}'.`);
  }
}
if (!eventsClientSrc.includes('schemaVersion: number')) {
  fail('client/src/events.ts must declare schemaVersion on every decoded event.');
}

// ─── Report ──────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\nABI drift detected between the Soroban contract schema and the TypeScript client:\n`);
  for (const [i, msg] of failures.entries()) {
    console.error(`${i + 1}. ${msg}\n`);
  }
  console.error(
    `To fix: regenerate schema.json from the contract (cd soroban/contracts/invoice-payment && ./generate-schema.sh,\n` +
      `or run: make schema), then update soroban/client/src accordingly, and re-run this check:\n` +
      `  node soroban/scripts/check-client-drift.mjs\n`,
  );
  process.exit(1);
}

console.log(
  `No ABI drift: ${manifestErrors.size} error codes, ${calledMethods.size} methods, and ${rustEvents.size} event payloads match.`,
);
