# Soroban Admin Key Rotation Procedure

## Overview

The Soroban payment contract uses a two-step admin handoff process:
1. propose_admin - Current admin proposes a new admin address
2. accept_admin - The proposed admin accepts the role

This document describes how to rotate the admin key used for anchoring.

## Prerequisites

- Access to the current admin secret key
- Access to the new admin secret key
- SOROBAN_RPC_URL and SOROBAN_CONTRACT_ID configured
- The new admin keypair generated

## Step 1: Generate New Admin Keypair

```bash
stellar keys generate new-admin
```

## Step 2: Propose New Admin (on-chain)

```typescript
const client = new SorobanInvoiceClient({
  rpcUrl: process.env.SOROBAN_RPC_URL,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE,
  contractId: process.env.SOROBAN_CONTRACT_ID,
  signerSecretKey: process.env.OLD_ADMIN_SECRET_KEY,
});

await client.proposeAdmin(process.env.NEW_ADMIN_PUBLIC_KEY);
```

## Step 3: Accept Admin Role (on-chain)

```typescript
const client = new SorobanInvoiceClient({
  rpcUrl: process.env.SOROBAN_RPC_URL,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE,
  contractId: process.env.SOROBAN_CONTRACT_ID,
  signerSecretKey: process.env.ADMIN_SECRET_KEY,
});

await client.acceptAdmin();
```

## Step 4: Verify Rotation

```typescript
const admin = await client.getAdmin();
console.log('Current admin:', admin);
```

## Step 5: Update Deployment

1. Update .env with new ADMIN_SECRET_KEY
2. Restart services
3. Verify anchoring works

## Important Notes

- The admin key is the sole authority for the contract
- Always test rotation on testnet before mainnet
- Maintain a secure backup of admin keys
