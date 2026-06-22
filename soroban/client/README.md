# Soroban Client Bindings

This package includes generated bindings for the `invoice-payment` Soroban contract.

## Regenerate bindings

From `soroban/client/`:

```bash
npm run generate:bindings
```

That command:

1. Builds the contract WASM in `soroban/target/wasm32v1-none/release/invoice_payment.wasm`.
2. Reads the embedded contract spec from the WASM artifact.
3. Regenerates `src/generated/invoice-payment-bindings.ts`.

## Check for drift

Use the check variant in CI or before committing:

```bash
npm run generate:bindings:check
```

If the contract ABI changes and the generated file is stale, the command exits non-zero.
