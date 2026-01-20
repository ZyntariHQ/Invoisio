# 🧾 Invoisio — Privacy‑Focused AI Invoice Generator on Base
https://invoisio-roan.vercel.app/

> Effortless, private invoicing for freelancers and small businesses

Invoisio is a modern, privacy‑first invoice platform. It pairs AI‑assisted invoice creation with seamless crypto payments on Base (EVM). A minimal PaymentRouter smart contract forwards funds to merchants and emits events your backend listens to for reliable, off‑chain reconciliation.

![Next.js](https://img.shields.io/badge/Next.js-14.2.16-black?style=for-the-badge&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-^3.x-38B2AC?style=for-the-badge&logo=tailwindcss)
![Hardhat](https://img.shields.io/badge/Hardhat-Toolbox-yellow?style=for-the-badge&logo=ethereum)
![Base](https://img.shields.io/badge/Base-Sepolia-0052FF?style=for-the-badge&logo=coinbase)

## ✨ Highlights

- AI‑assisted invoice creation with clean, responsive UI
- Wallet‑based authentication; no passwords
- Crypto payments on Base: ETH and USDC via a PaymentRouter
- Real‑time backend reconciliation by watching on‑chain events
- Privacy‑first mindset; collect only what’s necessary

## 🏗️ Monorepo Structure

```
./
├── webapp/     # Next.js 14 app (frontend UI)
├── backend/    # NestJS API (auth, invoices, payment matching)
├── contracts/  # Solidity sources (PaymentRouter)
└── hardhat/    # Hardhat project (compile/deploy/ABI)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm or npm
- An EVM wallet (MetaMask, Coinbase Wallet)
- Base Sepolia test ETH for deployment/testing

### 1) Deploy PaymentRouter to Base

1. Configure Hardhat environment (`hardhat/.env`):
   ```env
   PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
   RPC_URL=https://sepolia.base.org
   RPC_URL_MAINNET=https://mainnet.base.org
   ```
2. Install and compile:
   ```bash
   cd hardhat
   npm install
   npx hardhat compile
   ```
3. Deploy to Base Sepolia:
   ```bash
   npx hardhat run scripts/deploy.js --network baseSepolia
   # Note the printed PaymentRouter address
   ```

4. Prove a transaction on Base Sepolia (required for submission):
   ```bash
   # Set envs (can be in hardhat/.env)
   set ROUTER_ADDRESS=0xDeployedRouter
   set MERCHANT_ADDRESS=0xYourMerchant
   # optional: set INVOICE_ID=0x...
   npx hardhat run scripts/tx-demo.js --network baseSepolia
   # Copy the Basescan link printed by the script
   ```

The router emits:
```
event PaymentReceived(
  bytes32 indexed invoiceId,
  address indexed payer,
  address indexed token,     // address(0) for ETH; ERC20 address for tokens
  address merchant,
  uint256 amount
);
```

### 2) Configure Backend (NestJS)

Create `backend/.env` and set:
```env
# Base network
EVM_RPC_URL=https://sepolia.base.org
EVM_CHAIN_ID=84532       # 8453 for Base mainnet

# Payments
EVM_ROUTER_ADDRESS=0x... # from Hardhat deploy
EVM_USDC_ADDRESS=0x...   # optional: Base Sepolia USDC address
EVM_MERCHANT_ADDRESS=0x... # optional default merchant (if not per‑invoice)

# Database, auth, etc.
DATABASE_URL=postgresql://...
JWT_SECRET=...
```
Then:
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```
The `EvmWatcherService` listens for:
- Router `PaymentReceived` events (ETH and USDC)
- ERC20 `Transfer` events (USDC)
- Direct ETH transfers in new blocks (matches by merchant address)

### 3) Run the Frontend (Next.js)

```bash
cd webapp
npm install
npm run dev
# open http://localhost:3000
```
The frontend uses `WalletConnectModal` and `use-evm-wallet` to connect a wallet. When paying:
- ETH: call `router.payETH(merchant, invoiceId)` with `value` set in the transaction
- USDC: `approve(router, amount)` then `router.payERC20(usdc, merchant, amount, invoiceId)`

## 🔐 Authentication

- Wallet signature flow; no passwords
- Users own their identity via their wallet
- Minimal data collection to preserve privacy

## 📚 Development Scripts

- Frontend:
  - `npm run dev` — start Next.js dev server
  - `npm run build` — production build
  - `npm run start` — run built app
- Backend:
  - `npm run start:dev` — run NestJS in watch mode
  - `npm run test` / `npm run test:e2e` — tests
- Contracts/Hardhat:
  - `npx hardhat compile` — compile contracts
  - `npx hardhat run scripts/deploy.js --network baseSepolia` — deploy router
  - `npx hardhat run scripts/tx-demo.js --network baseSepolia` — send demo payment

## 🧩 Basenames & Base Account Kit (recommended)

To make onboarding easy and show identity, integrate Basenames and Base Account Kit:

- Basenames (human‑readable names on Base):
  - Install: `npm i @coinbase/onchainkit`
  - Use Identity helpers/components to resolve/display a Basename for the connected address.
  - Fallback to shortened address if no Basename.

- Base Account Kit (4337 smart wallets on Base):
  - Enable Smart Wallet to reduce friction and allow sponsored transactions.
  - Add Account Kit provider in the frontend and surface a "Connect" button using the kit’s components.
  - Keep our custom router flow; sign and submit via the smart wallet.

Document your integration (screenshots + short notes) in the submission and link to:
 - Basename shown in the UI
 - Smart wallet address used to submit the demo payment

## 🧩 Tech Stack

- Next.js 14, TypeScript, Tailwind CSS (neumorphic styling)
- Radix UI + shadcn/ui components
- NestJS + Prisma (PostgreSQL)
- Hardhat + Ethers (contracts and deploy)

## 🗺️ Roadmap

- [ ] Full invoice CRUD and client portal
- [ ] Advanced AI invoice suggestions
- [ ] Multi‑currency improvements and fiat on‑ramps
- [ ] Analytics dashboard and reporting
- [ ] PDF export and email delivery

## ✅ Hackathon Submission Checklist

- Onchain: Router deployed on Base Sepolia, with at least one `payETH` or `payERC20` tx
- Proof links: Basescan contract address + tx hash (from `tx-demo.js` output)
- Technicality: Backend watcher logs showing matched payment, frontend invoice marked paid
- Originality: Clear privacy‑first value prop (AI + minimal data)
- Viability: Target customer profile defined (freelancers, small businesses)
- Specific: Demo focuses on privacy‑preserving invoice + payment
- Practicality: Public repo, easy local run, no special hardware
- Wow Factor: End‑to‑end flow within the timeframe with clean UX

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m "feat: add amazing feature"`
4. Push: `git push origin feature/amazing-feature`
5. Open a PR

## 📄 License

MIT — see `LICENSE`.

## 🙏 Acknowledgments

- https://base.org/ — Base L2 by Coinbase
- https://nextjs.org/ — React framework
- https://tailwindcss.com/ — utility‑first styling
- https://www.radix-ui.com/ — accessible primitives
- https://hardhat.org/ — Ethereum development environment

---

<div align="center">
  <p>Built with ❤️ for freelancers on Base</p>
  <p><a href="#-invoisio-%E2%80%94-privacy%E2%80%91focused-ai-invoice-generator-on-base">Back to Top</a></p>
</div>
