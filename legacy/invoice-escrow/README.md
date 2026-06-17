# Invoice Escrow Smart Contract

A Soroban smart contract for invoice escrow with milestone payments on Stellar.

## Features

- Create escrow invoices with multiple milestones
- Fund invoices using Stellar assets
- Approve and release milestone payments
- Cancel invoices and refund remaining funds
- Full event logging for auditability
- Versioned contract metadata

## Quick Start

### Prerequisites

- Rust with `wasm32-unknown-unknown` target
- Stellar CLI (`stellar`)
- Stellar account with testnet XLM

### Build

```bash
make build
```

### Test

```bash
make test
```

### Deploy to Testnet

```bash
make deploy-testnet SOURCE=<your-secret-key>
```

## Contract Methods

### `initialize(admin: Address)`
Initialize the contract and set admin.

### `create_invoice(...)`
Create a new escrow invoice with milestones.

### `fund_invoice(invoice_id: String, from: Address)`
Fund an invoice escrow.

### `approve_milestone(...)`
Approve a completed milestone.

### `release_milestone(...)`
Release funds for an approved milestone.

### `cancel_invoice(...)`
Cancel an invoice and refund remaining funds.

## License

MIT
