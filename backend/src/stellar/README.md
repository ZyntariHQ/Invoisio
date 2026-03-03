# Stellar Module

A comprehensive module for interacting with the Stellar blockchain, providing abstraction over Horizon API and Soroban RPC.

## Features

- **Horizon API Integration**: Full integration with Stellar Horizon for account queries, payment verification, and transaction monitoring
- **Address Validation**: Utility methods to validate Stellar account addresses (G-addresses) and contract addresses (C-addresses)
- **Error Handling**: Custom exception hierarchy for graceful error handling
- **Dependency Injection**: Fully injectable service for use across modules
- **Type Safety**: Comprehensive DTOs for type-safe data transfer

## Configuration

Configure the Stellar module via environment variables in `.env`:

```env
# Stellar Network Configuration
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
MERCHANT_PUBLIC_KEY=GCTA6XNAVRY3LWPCQYKXSTN2EJZMRADT64D6VHBSW6UJZPKQMF3CZABM
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
USDC_ASSET_CODE=USDC
MEMO_PREFIX=invoisio-
```

### Network Options

**Testnet:**
```env
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

**Mainnet:**
```env
HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
```

## Installation

The module is already registered in `app.module.ts`:

```typescript
import { StellarModule } from './stellar/stellar.module';

@Module({
  imports: [
    // ... other modules
    StellarModule,
  ],
})
export class AppModule {}
```

## Usage

### Injecting StellarService

```typescript
import { Injectable } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class PaymentWatcherService {
  constructor(
    private readonly stellarService: StellarService,
  ) {}
}
```

### Getting Account Details

```typescript
async getUserBalance(publicKey: string): Promise<number> {
  try {
    const accountDetails = await this.stellarService.getAccountDetails(publicKey);
    
    // Get XLM balance
    const xlmBalance = accountDetails.balances.find(b => b.asset === 'XLM');
    return parseFloat(xlmBalance?.balance || '0');
  } catch (error) {
    if (error instanceof StellarAccountNotFoundException) {
      // Account doesn't exist on Stellar
      return 0;
    }
    throw error;
  }
}
```

### Validating Addresses

```typescript
import { StellarValidator } from '../stellar/utils/stellar.validator';
import { StellarAddressInvalidException } from '../stellar/exceptions/stellar.exceptions';

// Validate account address
const isValid = StellarValidator.isValidPublicKey('GCTA...'); // true

// Validate contract address
const isContractValid = StellarValidator.isValidContractAddress('CA3S...'); // true

// Or use service methods
try {
  this.stellarService.assertValidPublicKey('INVALID_ADDRESS');
} catch (error) {
  if (error instanceof StellarAddressInvalidException) {
    // Handle invalid address
  }
}
```

### Verifying Payments

```typescript
async checkInvoicePayment(invoiceId: string): Promise<boolean> {
  const memo = this.stellarService.generateMemo(invoiceId);
  
  const verification = await this.stellarService.verifyPayment(
    memo,
    this.stellarService.getMerchantPublicKey(),
  );
  
  return verification.found;
}
```

### Watching for Payments (Real-time)

```typescript
async startPaymentMonitoring() {
  await this.stellarService.watchPayments((payment) => {
    this.logger.log(`Payment received: ${payment.amount} ${payment.asset_code || 'XLM'}`);
    
    // Parse memo to get invoice ID
    const invoiceId = this.stellarService.parseMemo(payment.memo);
    if (invoiceId) {
      // Process invoice payment
      this.processInvoicePayment(invoiceId, payment);
    }
  });
}
```

### Working with Balances

```typescript
async getBalances(publicKey: string) {
  // Get XLM balance
  const xlmBalance = await this.stellarService.getXlmBalance(publicKey);
  
  // Get USDC balance
  const usdcBalance = await this.stellarService.getUsdcBalance(publicKey);
  
  // Get all balances
  const allBalances = await this.stellarService.getAccountBalance(publicKey);
  
  return { xlmBalance, usdcBalance, allBalances };
}
```

### Generating KeyPairs (Utility)

```typescript
import { StellarValidator } from '../stellar/utils/stellar.validator';

// Generate new keypair
const keypair = StellarValidator.generateKeypair();
console.log('Public Key:', keypair.publicKey);
console.log('Secret Key:', keypair.secretKey);

// Get public key from secret
const publicKey = StellarValidator.getPublicKeyFromSecret(secretKey);
```

## Exception Handling

The module provides custom exceptions for different error scenarios:

### StellarAccountNotFoundException
Thrown when an account doesn't exist on the Stellar network (404).

```typescript
try {
  const account = await stellarService.getAccountDetails(publicKey);
} catch (error) {
  if (error instanceof StellarAccountNotFoundException) {
    // Handle missing account
  }
}
```

### StellarAddressInvalidException
Thrown when address validation fails.

```typescript
try {
  stellarService.assertValidPublicKey('invalid-address');
} catch (error) {
  if (error instanceof StellarAddressInvalidException) {
    // Handle invalid address
  }
}
```

### HorizonApiException
Thrown when Horizon API returns an error.

```typescript
try {
  const account = await stellarService.getAccountDetails(publicKey);
} catch (error) {
  if (error instanceof HorizonApiException) {
    console.log('Horizon status:', error.horizonStatusCode);
    // Handle API errors (429 rate limit, 500 server errors, etc.)
  }
}
```

### Using the Exception Filter

Register the global exception filter in your module:

```typescript
import { APP_FILTER } from '@nestjs/core';
import { StellarExceptionFilter } from '../stellar/exceptions/stellar.exceptions';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: StellarExceptionFilter,
    },
  ],
})
export class AppModule {}
```

## DTOs

The module exports type-safe DTOs:

- `AccountDetailsDto`: Complete account information with balances
- `AccountBalanceDto`: Single balance entry
- `PaymentVerificationDto`: Payment verification result
- `TransactionDto`: Transaction details
- `PaymentDto`: Payment record

## Methods Reference

### StellarService

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccountDetails(publicKey)` | Fetch account details including balances | `Promise<AccountDetailsDto>` |
| `getAccountBalance(publicKey)` | Fetch account balances only | `Promise<AccountBalanceDto[]>` |
| `getXlmBalance(publicKey)` | Get XLM balance specifically | `Promise<string \| null>` |
| `getUsdcBalance(publicKey)` | Get USDC balance specifically | `Promise<string \| null>` |
| `verifyPayment(memo, destination?)` | Verify if payment exists for memo | `Promise<PaymentVerificationDto>` |
| `watchPayments(callback, memo?)` | Stream payments in real-time | `Promise<void>` |
| `getTransactionByHash(hash)` | Get transaction details | `Promise<TransactionDto>` |
| `generateMemo(invoiceId)` | Generate formatted memo | `string` |
| `parseMemo(memo)` | Extract invoice ID from memo | `string \| null` |
| `isValidPublicKey(publicKey)` | Validate account address | `boolean` |
| `isValidContractAddress(address)` | Validate contract address | `boolean` |
| `assertValidPublicKey(publicKey)` | Validate or throw exception | `void` |
| `assertValidContractAddress(address)` | Validate or throw exception | `void` |
| `getServer()` | Get Horizon Server instance | `any` |
| `getConfig()` | Get Stellar configuration | `object` |
| `getHorizonUrl()` | Get Horizon URL | `string` |
| `getMerchantPublicKey()` | Get merchant public key | `string` |
| `getNetworkPassphrase()` | Get network passphrase | `string` |
| `isTestnet()` | Check if using testnet | `boolean` |

### StellarValidator

| Method | Description | Returns |
|--------|-------------|---------|
| `isValidPublicKey(publicKey)` | Validate account address | `boolean` |
| `isValidSecretKey(secretKey)` | Validate secret key | `boolean` |
| `isValidContractAddress(address)` | Validate contract address | `boolean` |
| `isValidIssuer(issuer)` | Validate asset issuer | `boolean` |
| `isValidMemo(memo)` | Validate memo format | `boolean` |
| `isValidAssetCode(code)` | Validate asset code | `boolean` |
| `getPublicKeyFromSecret(secretKey)` | Derive public key | `string` |
| `generateKeypair()` | Generate new keypair | `{ publicKey, secretKey }` |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `STELLAR_ERROR` | 500 | Generic Stellar error |
| `STELLAR_ACCOUNT_NOT_FOUND` | 404 | Account doesn't exist |
| `STELLAR_PAYMENT_NOT_FOUND` | 404 | Payment/transaction not found |
| `STELLAR_ADDRESS_INVALID` | 400 | Invalid address format |
| `HORIZON_API_ERROR` | Varies | Horizon API error |
| `SOROBAN_RPC_ERROR` | 500 | Soroban RPC error |
| `STELLAR_NETWORK_CONFIG_ERROR` | 500 | Configuration error |

## Testing

Run tests for the Stellar module:

```bash
npm test -- stellar.service.spec.ts
```

## Future Enhancements

- [ ] Soroban RPC integration for smart contract interactions
- [ ] Transaction building and submission
- [ ] Multi-signature support
- [ ] Enhanced payment filtering
- [ ] Batch operations
- [ ] Caching layer for frequently accessed accounts

## Troubleshooting

### "Stellar server not initialized"
Check that `HORIZON_URL` is correctly configured in your `.env` file.

### "Account not found"
Ensure the account has been funded on the network you're connecting to (testnet vs mainnet).

### Rate Limiting (429 errors)
Horizon API has rate limits. Consider implementing retry logic or using a dedicated Horizon node.

## Support

For issues or questions, please refer to the [Stellar documentation](https://developers.stellar.org/).
