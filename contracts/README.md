# Contracts

Minimal on-chain footprint to keep things simple.

## PaymentRouter.sol
- Forwards ETH/ERC20 (e.g., USDC) directly to the merchant.
- Emits `PaymentReceived(invoiceId, payer, token, merchant, amount)` for off-chain attribution.
- No custody, no storage; purely pass-through.

### Compile & Deploy (Foundry)
```bash
forge init invoisio-contracts
cp contracts/PaymentRouter.sol src/PaymentRouter.sol
forge build
forge create --rpc-url $RPC --private-key $PK src/PaymentRouter.sol:PaymentRouter
```

### Compile & Deploy (Hardhat)
```bash
# one-time setup already scaffolded in repo under /hardhat
cd hardhat
npm install
cp ../contracts/PaymentRouter.sol contracts/PaymentRouter.sol  # optional if you change the contract

# fill .env with your Base RPC and PRIVATE_KEY
cp .env.example .env
# edit .env to set PRIVATE_KEY and RPC_URL

# compile and deploy to Base Sepolia
npm run compile
npm run deploy:baseSepolia

# after deploy, set the backend env
# EVM_ROUTER_ADDRESS=<deployed_address>
```

> Note: You can start without deploying this contract. Direct ETH/USDC transfers to `EVM_MERCHANT_ADDRESS` work fine, and the backend watcher will detect payments.