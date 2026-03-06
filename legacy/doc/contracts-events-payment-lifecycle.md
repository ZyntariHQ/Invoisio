# Contract Events and Payment Lifecycle

## Overview

The `PaymentRouter` contract emits events that enable the API and webapp to track payment lifecycles. This document specifies all events, provides listener examples, and diagrams the complete payment flow.

---

## Events Reference

### 1. PaymentReceived

**Emitted when:** A payment (ETH or ERC20) is successfully processed through `payETH()` or `payERC20()`.

**Signature:**
```solidity
event PaymentReceived(
    bytes32 indexed invoiceId,
    address indexed payer,
    address indexed token,
    address merchant,
    uint256 amount
);
```

**Parameters:**
| Parameter | Type | Indexed | Description |
|-----------|------|---------|-------------|
| `invoiceId` | `bytes32` | ✓ | Unique invoice identifier (use for correlation) |
| `payer` | `address` | ✓ | Address that initiated the payment |
| `token` | `address` | ✓ | Token address (`address(0)` for ETH) |
| `merchant` | `address` | ✗ | Recipient merchant address |
| `amount` | `uint256` | ✗ | Payment amount (wei for ETH, token units for ERC20) |

**Usage:** Primary event for tracking invoice payments. Filter by `invoiceId` to match payments to invoices.

---

### 2. ETHReceived

**Emitted when:** ETH is sent directly to the contract via `receive()` or `fallback()`.

**Signature:**
```solidity
event ETHReceived(address indexed from, uint256 amount);
```

**Parameters:**
| Parameter | Type | Indexed | Description |
|-----------|------|---------|-------------|
| `from` | `address` | ✓ | Sender address |
| `amount` | `uint256` | ✗ | Amount of ETH received (wei) |

**Usage:** Monitoring only. These funds are auto-refunded (see `ETHRefunded`).

---

### 3. ETHRefunded

**Emitted when:** ETH sent directly to the contract is automatically refunded.

**Signature:**
```solidity
event ETHRefunded(address indexed to, uint256 amount);
```

**Parameters:**
| Parameter | Type | Indexed | Description |
|-----------|------|---------|-------------|
| `to` | `address` | ✓ | Refund recipient |
| `amount` | `uint256` | ✗ | Amount refunded (wei) |

**Usage:** Audit trail for accidental transfers. Not used for invoice tracking.

---

## Event Listener Implementation

### Setup (ethers.js v6)

```typescript
import { ethers } from 'ethers';

const PAYMENT_ROUTER_ADDRESS = '0x...';
const PAYMENT_ROUTER_ABI = [
  'event PaymentReceived(bytes32 indexed invoiceId, address indexed payer, address indexed token, address merchant, uint256 amount)',
  'event ETHReceived(address indexed from, uint256 amount)',
  'event ETHRefunded(address indexed to, uint256 amount)'
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(PAYMENT_ROUTER_ADDRESS, PAYMENT_ROUTER_ABI, provider);
```

### Listen for PaymentReceived Events

```typescript
async function listenForPayments() {
  contract.on('PaymentReceived', async (invoiceId, payer, token, merchant, amount, event) => {
    try {
      const paymentData = {
        invoiceId: invoiceId,
        payer: payer,
        token: token === ethers.ZeroAddress ? 'ETH' : token,
        merchant: merchant,
        amount: amount.toString(),
        txHash: event.log.transactionHash,
        blockNumber: event.log.blockNumber
      };

      console.log('Payment received:', paymentData);
      
      // Update invoice status in database
      await updateInvoiceStatus(paymentData);
    } catch (error) {
      console.error('Error processing payment event:', error);
      // Implement retry logic or dead-letter queue
    }
  });

  console.log('Listening for payment events...');
}
```

### Query Historical Events

```typescript
async function getPaymentHistory(invoiceId: string, fromBlock: number = 0) {
  try {
    const filter = contract.filters.PaymentReceived(invoiceId);
    const events = await contract.queryFilter(filter, fromBlock, 'latest');

    return events.map(event => ({
      invoiceId: event.args.invoiceId,
      payer: event.args.payer,
      token: event.args.token === ethers.ZeroAddress ? 'ETH' : event.args.token,
      merchant: event.args.merchant,
      amount: event.args.amount.toString(),
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: null // Fetch from block if needed
    }));
  } catch (error) {
    console.error('Error querying payment history:', error);
    throw error;
  }
}
```

### Decode Event from Transaction Receipt

```typescript
async function decodePaymentFromTx(txHash: string) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) throw new Error('Transaction not found');

    const iface = new ethers.Interface(PAYMENT_ROUTER_ABI);
    
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });

        if (parsed?.name === 'PaymentReceived') {
          return {
            invoiceId: parsed.args.invoiceId,
            payer: parsed.args.payer,
            token: parsed.args.token,
            merchant: parsed.args.merchant,
            amount: parsed.args.amount.toString()
          };
        }
      } catch (e) {
        // Log doesn't match our ABI, skip
        continue;
      }
    }

    throw new Error('PaymentReceived event not found in transaction');
  } catch (error) {
    console.error('Error decoding transaction:', error);
    throw error;
  }
}
```

### Error Handling & Reconnection

```typescript
function setupRobustListener() {
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  function connect() {
    listenForPayments();

    provider.on('error', (error) => {
      console.error('Provider error:', error);
      
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connect, 5000 * reconnectAttempts);
      }
    });

    provider.on('network', () => {
      reconnectAttempts = 0; // Reset on successful connection
    });
  }

  connect();
}
```

---

## Payment Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PAYMENT LIFECYCLE                           │
└─────────────────────────────────────────────────────────────────────┘

1. INVOICE CREATION
   ┌──────────────┐
   │   Webapp     │  User creates invoice with AI assistance
   └──────┬───────┘
          │ POST /api/invoices
          ▼
   ┌──────────────┐
   │   Backend    │  Store invoice { id, merchant, amount, status: 'pending' }
   └──────┬───────┘
          │
          ▼
   [Database: Invoice record created]


2. PAYMENT INITIATION
   ┌──────────────┐
   │   Webapp     │  User clicks "Pay with ETH/USDC"
   └──────┬───────┘
          │ Connect wallet (MetaMask, etc.)
          │ Convert invoiceId → bytes32
          ▼
   ┌──────────────┐
   │   Wallet     │  Sign transaction:
   └──────┬───────┘  - payETH(merchant, invoiceId) OR
          │          - payERC20(token, merchant, amount, invoiceId)
          │
          ▼
   ┌──────────────┐
   │ PaymentRouter│  Execute payment, forward funds to merchant
   │   Contract   │
   └──────┬───────┘
          │
          │ emit PaymentReceived(invoiceId, payer, token, merchant, amount)
          ▼
   [Blockchain: Event logged in transaction receipt]


3. EVENT DETECTION
   ┌──────────────┐
   │   Backend    │  Event listener detects PaymentReceived
   │   Listener   │  - Filter by invoiceId
   └──────┬───────┘  - Extract: payer, amount, token, txHash
          │
          ▼
   [Validate: amount matches invoice, merchant correct]


4. STATE UPDATE
   ┌──────────────┐
   │   Backend    │  Update invoice:
   │     API      │  - status: 'paid'
   └──────┬───────┘  - paidAt: timestamp
          │          - txHash: transaction hash
          │          - payer: payer address
          ▼
   [Database: Invoice marked as paid]


5. CONFIRMATION
   ┌──────────────┐
   │   Webapp     │  Poll /api/invoices/:id OR WebSocket notification
   └──────┬───────┘  Display: "Payment confirmed ✓"
          │
          ▼
   [User sees success state with transaction link]


┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR SCENARIOS                             │
└─────────────────────────────────────────────────────────────────────┘

• Transaction reverts → No event emitted → Invoice stays 'pending'
• Partial payment → Event emitted with actual amount → Backend flags mismatch
• Listener offline → Query historical events on restart (queryFilter)
• Wrong invoiceId → Event emitted but no matching invoice → Log warning
```

---

## Event-to-State Mapping

| Event | Invoice Status Transition | Action |
|-------|---------------------------|--------|
| `PaymentReceived` | `pending` → `paid` | Update invoice, store txHash, notify user |
| `PaymentReceived` (amount mismatch) | `pending` → `partial` | Flag for manual review |
| `PaymentReceived` (unknown invoiceId) | N/A | Log warning, investigate |
| No event after 10 min | `pending` → `pending` | Show "waiting for confirmation" |
| Transaction reverted | `pending` → `pending` | No state change (no event) |

---

## Integration Checklist

- [ ] Deploy `PaymentRouter` contract and note address
- [ ] Configure backend with contract address and ABI
- [ ] Implement event listener with reconnection logic
- [ ] Set up historical event query on service restart
- [ ] Add database fields: `txHash`, `payer`, `paidAt`
- [ ] Create API endpoint to query payment status by invoiceId
- [ ] Implement WebSocket or polling for real-time updates in webapp
- [ ] Add monitoring/alerting for listener downtime
- [ ] Test with testnet (Sepolia, Base Sepolia)
- [ ] Document RPC provider requirements (WebSocket support recommended)

---

## Best Practices

1. **Use indexed parameters for filtering:** `invoiceId`, `payer`, `token` are indexed for efficient queries
2. **Store block number:** Track last processed block to resume after downtime
3. **Idempotency:** Check if invoice already paid before updating (prevent duplicate processing)
4. **Validate amounts:** Compare event `amount` with invoice expected amount
5. **Retry logic:** Implement exponential backoff for failed event processing
6. **Dead-letter queue:** Store failed events for manual review
7. **WebSocket preferred:** More reliable than HTTP polling for real-time events
8. **Confirmations:** Wait for N block confirmations before marking as final (e.g., 12 blocks)

---

## Example: Complete Backend Service

```typescript
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const provider = new ethers.WebSocketProvider(process.env.WS_RPC_URL);
const contract = new ethers.Contract(PAYMENT_ROUTER_ADDRESS, PAYMENT_ROUTER_ABI, provider);

let lastProcessedBlock = 0;

async function updateInvoiceStatus(paymentData: any) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: paymentData.invoiceId }
  });

  if (!invoice) {
    console.warn('Invoice not found:', paymentData.invoiceId);
    return;
  }

  if (invoice.status === 'paid') {
    console.log('Invoice already paid, skipping');
    return;
  }

  await prisma.invoice.update({
    where: { id: paymentData.invoiceId },
    data: {
      status: 'paid',
      paidAt: new Date(),
      txHash: paymentData.txHash,
      payer: paymentData.payer
    }
  });

  console.log(`Invoice ${paymentData.invoiceId} marked as paid`);
}

async function processHistoricalEvents() {
  const fromBlock = lastProcessedBlock || (await provider.getBlockNumber()) - 1000;
  const events = await contract.queryFilter(contract.filters.PaymentReceived(), fromBlock);

  for (const event of events) {
    await updateInvoiceStatus({
      invoiceId: event.args.invoiceId,
      payer: event.args.payer,
      token: event.args.token,
      merchant: event.args.merchant,
      amount: event.args.amount.toString(),
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber
    });
  }

  lastProcessedBlock = await provider.getBlockNumber();
}

async function startListener() {
  await processHistoricalEvents();

  contract.on('PaymentReceived', async (invoiceId, payer, token, merchant, amount, event) => {
    await updateInvoiceStatus({
      invoiceId,
      payer,
      token,
      merchant,
      amount: amount.toString(),
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber
    });

    lastProcessedBlock = event.log.blockNumber;
  });
}

startListener().catch(console.error);
```

---

## References

- [ethers.js Events Documentation](https://docs.ethers.org/v6/api/contract/#ContractEvent)
- [Solidity Events](https://docs.soliditylang.org/en/latest/contracts.html#events)
- PaymentRouter contract: `legacy/legacy-evm/contracts/contracts/PaymentRouter.sol`

---

**Last Updated:** 2026-03-05  
**Contract Version:** PaymentRouter v1.0 (Legacy EVM)
