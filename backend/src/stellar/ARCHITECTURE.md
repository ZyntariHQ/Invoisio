# Stellar Module Architecture

## Directory Structure

```
backend/src/stellar/
├── index.ts                          # Public API exports
├── stellar.module.ts                 # NestJS module configuration
├── stellar.service.ts                # Main service with Horizon API integration
├── stellar.service.spec.ts           # Unit tests
├── usage-examples.ts                 # Integration examples
├── README.md                         # Usage documentation
├── IMPLEMENTATION_SUMMARY.md         # Implementation details
├── ARCHITECTURE.md                   # This file
│
├── dto/
│   └── stellar.dto.ts               # Data Transfer Objects
│       ├── AccountBalanceDto
│       ├── AccountDetailsDto
│       ├── PaymentDto
│       ├── PaymentVerificationDto
│       └── TransactionDto
│
├── exceptions/
│   └── stellar.exceptions.ts        # Custom exception hierarchy
│       ├── StellarException (base)
│       ├── StellarAccountNotFoundException
│       ├── StellarPaymentNotFoundException
│       ├── StellarAddressInvalidException
│       ├── HorizonApiException
│       ├── SorobanRpcException
│       ├── StellarNetworkConfigException
│       └── StellarExceptionFilter
│
└── utils/
    └── stellar.validator.ts         # Validation utilities
        ├── isValidPublicKey()
        ├── isValidContractAddress()
        ├── isValidSecretKey()
        ├── generateKeypair()
        └── ... (8 validation methods)
```

## Component Relationships

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                     │
│  (InvoicesModule, AuthModule, UsersModule, etc.)        │
└────────────────────┬────────────────────────────────────┘
                     │ imports & uses
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  StellarModule                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Providers:                                     │    │
│  │  - StellarService                               │    │
│  │  - STELLAR_VALIDATOR (StellarValidator)         │    │
│  │                                                 │    │
│  │  Exports:                                       │    │
│  │  - StellarService                               │    │
│  │  - All Exception Classes                        │    │
│  │  - StellarExceptionFilter                       │    │
│  │  - StellarValidator                             │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
┌────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│ stellar.dto.ts │ │stellar.validator│ │stellar.exceptions│
│                │ │                 │ │                  │
│ - Account DTOs │ │ - Address Valid│ │ - Exceptions     │
│ - Payment DTOs │ │ - Keypair Gen  │ │ - Exception Filter
│ - Transaction  │ │ - Memo Valid   │ │                  │
└────────────────┘ └─────────────────┘ └──────────────────┘
         │                                   │
         └──────────────────┬────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  StellarService  │
                  │                  │
                  │ Core Methods:    │
                  │ - getAccountDet..│
                  │ - verifyPayment  │
                  │ - watchPayments  │
                  │ - getTxByHash    │
                  │ - generateMemo   │
                  │ - validation     │
                  └────────┬─────────┘
                           │ uses
                           ▼
                  ┌──────────────────┐
                  │ @stellar/stellar-│
                  │ sdk              │
                  │                  │
                  │ - Horizon.Server │
                  │ - StrKey         │
                  │ - Keypair        │
                  │ - Networks       │
                  └──────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Horizon API      │
                  │ (Stellar Network)│
                  └──────────────────┘
```

## Data Flow

### Get Account Details Flow

```
User/Service
    │
    │ 1. Call getAccountDetails(publicKey)
    ▼
StellarService
    │
    │ 2. Validate publicKey
    ▼
StellarValidator.isValidPublicKey()
    │
    │ 3. If invalid → throw StellarAddressInvalidException
    │
    │ 4. If valid → call Horizon API
    ▼
StellarSdk.Horizon.Server.loadAccount()
    │
    │ 5. Horizon returns account data
    │
    │ 6. Map to AccountDetailsDto
    ▼
Return AccountDetailsDto {
  id, publicKey, sequence,
  balances[], subentryCount,
  minimumBalance
}
```

### Error Handling Flow

```
Horizon API Error (e.g., 404 Not Found)
    │
    ▼
StellarService catches error
    │
    │ Check error type
    ├─→ isAxiosError && status === 404
    │   └─→ throw StellarAccountNotFoundException
    │
    ├─→ isAxiosError && status === 429
    │   └─→ throw HorizonApiException (429)
    │
    ├─→ isAxiosError && status >= 500
    │   └─→ throw HorizonApiException (502)
    │
    └─→ Other error
        └─→ throw StellarException
            │
            ▼
        StellarExceptionFilter (if registered globally)
            │
            │ Transform to JSON response
            ▼
        HTTP Response {
          statusCode: 404,
          code: "STELLAR_ACCOUNT_NOT_FOUND",
          message: "Account not found: G...",
          timestamp: "2026-03-03T..."
        }
```

### Payment Watch Flow

```
Service calls watchPayments(callback)
    │
    ▼
StellarService.watchPayments()
    │
    │ 1. Get merchant public key
    │ 2. Create payments call builder
    │ 3. Set cursor to "now"
    │
    ▼
server.payments()
  .forAccount(merchantKey)
  .cursor("now")
  .stream({ onmessage, onerror })
    │
    │ Wait for incoming payments...
    │
    ├─→ Payment received
    │   │
    │   ▼
    │ onmessage(paymentRecord)
    │   │
    │   ▼
    │ callback(paymentRecord)
    │   │
    │   ▼
    │ Service processes payment
    │
    └─→ Stream error
        │
        ▼
        onerror(error)
          │
          ▼
          throw HorizonApiException
```

## Dependency Graph

```
┌──────────────────────────────────────────────────────┐
│                    Dependencies                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  @nestjs/common                                      │
│  @nestjs/config                                      │
│  @stellar/stellar-sdk                                │
│  class-validator (optional, removed from DTOs)       │
│                                                      │
└──────────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│              StellarModule Providers                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  StellarService ──► Uses ConfigService              │
│                                                      │
│  STELLAR_VALIDATOR (value provider)                 │
│                                                      │
└──────────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│           Consuming Modules (Examples)               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  InvoicesModule ──► Payment verification            │
│  AuthModule ──────► Address validation              │
│  UsersModule ─────► Key generation                  │
│  PaymentsModule ─► Payment watching                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Configuration Layers

```
┌─────────────────────────────────────┐
│       Environment (.env)            │
│  HORIZON_URL=...                    │
│  STELLAR_NETWORK_PASSPHRASE=...     │
│  MERCHANT_PUBLIC_KEY=...            │
│  USDC_ISSUER=...                    │
│  MEMO_PREFIX=...                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│    Config Module (NestJS)           │
│  - Loads .env                       │
│  - Validates with Joi               │
│  - Registers stellar config         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Stellar Config (stellar.config)   │
│  registerAs('stellar', () => ({     │
│    horizonUrl, networkPassphrase,   │
│    merchantPublicKey, usdcIssuer,   │
│    memoPrefix                       │
│  }))                                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      StellarService                 │
│  constructor(ConfigService)         │
│  getConfig() → stellar config       │
└─────────────────────────────────────┘
```

## Method Categories

### Account Management
- `getAccountDetails(publicKey)` → Full account info
- `getAccountBalance(publicKey)` → All balances
- `getXlmBalance(publicKey)` → XLM only
- `getUsdcBalance(publicKey)` → USDC only

### Payment Operations
- `verifyPayment(memo, destination?)` → Verify by memo
- `watchPayments(callback, memo?)` → Real-time stream
- `getTransactionByHash(hash)` → Transaction lookup

### Validation
- `isValidPublicKey(publicKey)` → Validate G-address
- `isValidContractAddress(address)` → Validate C-address
- `assertValidPublicKey(publicKey)` → Validate or throw
- `assertValidContractAddress(address)` → Validate or throw

### Utilities
- `generateMemo(invoiceId)` → Create memo
- `parseMemo(memo)` → Extract invoice ID
- `generateKeypair()` → Create new keypair (validator)
- `getPublicKeyFromSecret(secretKey)` → Derive public key

### Configuration Access
- `getConfig()` → All Stellar config
- `getHorizonUrl()` → Horizon endpoint
- `getMerchantPublicKey()` → Merchant key
- `getNetworkPassphrase()` → Network identifier
- `isTestnet()` → Network type check
- `getServer()` → Horizon Server instance

## Thread Safety & Concurrency

```
┌─────────────────────────────────────────┐
│  StellarService (Singleton)             │
│                                         │
│  Private: server (Horizon.Server)       │
│  - Immutable after initialization       │
│  - Thread-safe (no mutable state)       │
│                                         │
│  Methods are stateless                  │
│  - Safe for concurrent calls            │
│  - No shared mutable state              │
└─────────────────────────────────────────┘
```

## Extension Points

### Future Enhancements

1. **Soroban RPC Integration**
   ```
   SorobanService (new)
   ├── submitTransaction()
   ├── simulateTransaction()
   ├── getContractData()
   └── invokeContract()
   ```

2. **Transaction Building**
   ```
   TransactionBuilderService
   ├── createPaymentTx()
   ├── createTrustlineTx()
   ├── signTransaction()
   └── submitTransaction()
   ```

3. **Caching Layer**
   ```
   CacheService (Redis)
   ├── getCachedAccount(publicKey)
   ├── setCachedAccount(account)
   └── invalidateCache(publicKey)
   ```

4. **Rate Limiting**
   ```
   RateLimiterService
   ├── checkLimit()
   ├── waitAndRetry()
   └── exponentialBackoff()
   ```

This architecture provides a solid foundation for Stellar blockchain integration in Invoisio.
