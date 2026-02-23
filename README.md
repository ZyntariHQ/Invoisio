# 🧾 Invoisio — Privacy‑Focused AI Invoice Generator on Stellar
https://invoisio-roan.vercel.app/ 

Invoisio is a modern, privacy‑first invoice platform. It combines AI‑assisted invoice creation with fast, low‑cost crypto payments on the **Stellar network**. Payments are sent directly to merchant accounts using Stellar's native **Payment** operation. Optional **memos** (text or hash) carry the invoice identifier for reliable off‑chain matching and reconciliation.

Invoisio is being adapted to run with grant programs on **GrantFox (grantfox.xyz)** so contributors can help fund and use the app in real projects.

![Next.js](https://img.shields.io/badge/Next.js-14.2.16-black?style=for-the-badge&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-^3.x-38B2AC?style=for-the-badge&logo=tailwindcss)
![Stellar](https://img.shields.io/badge/Stellar-Network-7D00FF?style=for-the-badge&logo=stellar)
![Soroban](https://img.shields.io/badge/Soroban-ready-7D00FF?style=for-the-badge) <!-- optional if you later add Soroban -->

## ✨ Highlights

- AI‑assisted invoice creation with clean, responsive UI
- Wallet‑based authentication (Freighter, Lobstr, Albedo, etc.); no passwords
- Ultra‑low‑cost payments on Stellar: XLM and USDC
- Real‑time backend reconciliation via Horizon (listen for payments + memo)
- Privacy‑first mindset; collect only what’s necessary

## 🏗️ Monorepo Structure

```
./
├── webapp/         # Next.js 14 app (frontend UI)
├── backend/        # New Stellar-first NestJS API (invoices, payments, Soroban integration)
└── legacy/         # All legacy code kept during migration
    ├── backend-legacy/ # Original backend kept as reference during migration
    └── legacy-evm/     # EVM prototype (Solidity + Hardhat)
        ├── contracts/  # Solidity PaymentRouter and related contracts
        └── hardhat/    # Hardhat project (compile/deploy EVM router)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm or npm
- A Stellar wallet (Freighter, Lobstr, Albedo, or StellarX)
- Testnet XLM from Friendbot faucet: `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY`

Replace `YOUR_PUBLIC_KEY` with your Stellar testnet address (starts with `G`).

### 1) Configure Backend (Horizon & Merchant Account)

Create `backend/.env` and set:

```env
# Stellar network
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
# For mainnet later: https://horizon.stellar.org + "Public Global Stellar Network ; September 2015"

# Merchant receiving account (your app's merchant public key)
MERCHANT_PUBLIC_KEY=GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Optional USDC issuer & asset (Circle USDC on Stellar)
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
USDC_ASSET_CODE=USDC

# For memo matching (your app logic decides format)
MEMO_PREFIX=invoisio-

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

The backend will be responsible for:
- Creating and storing invoices and their identifiers
- Watching Horizon for incoming payments to `MERCHANT_PUBLIC_KEY`
- Matching payments by memo (e.g., `invoisio-<invoiceId>`)

### 2) Run the Frontend (Next.js)

```bash
cd webapp
npm install
npm run dev
# open http://localhost:3000
```

The frontend handles:
- AI‑assisted invoice creation
- Displaying payment details for Stellar (destination, asset, amount, memo)
- Connecting a Stellar wallet (e.g., Freighter) to sign Payment operations

## 🔐 Authentication

- Wallet signature flow; no passwords
- Users own their identity via their Stellar wallet
- Minimal data collection to preserve privacy

## 🔧 Soroban (Stellar smart contracts)

Invoisio is being migrated to use **Soroban** for smart contract logic on Stellar. The current live flow relies on native **Payment** operations plus memos for matching, and Soroban will be used for more advanced features such as richer on‑chain events and programmable invoice/payment rules.

- Native Stellar payments:
  - Destination: `MERCHANT_PUBLIC_KEY`
  - Asset: XLM or USDC on Stellar
  - Memo: `MEMO_PREFIX + <invoiceId>` for off‑chain matching
- Soroban (planned/under development):
  - Rust‑based Soroban contract to log invoice/payment state
  - Events that backends can index alongside Horizon payment streams
  - Future room for programmable discounts, escrow, or milestone payments

## 📚 Development Scripts

- Frontend:
  - `npm run dev` — start Next.js dev server
  - `npm run build` — production build
  - `npm run start` — run built app
- Backend:
  - `npm run start:dev` — run NestJS in watch mode
  - `npm run test` / `npm run test:e2e` — tests
- Legacy contracts/Hardhat (EVM prototype, optional):
  - `npx hardhat compile` — compile contracts
  - `npx hardhat run scripts/deploy.js --network baseSepolia` — deploy router
  - `npx hardhat run scripts/tx-demo.js --network baseSepolia` — send demo payment

## 🧩 Tech Stack

- Next.js 14, TypeScript, Tailwind CSS (neumorphic styling)
- Radix UI + shadcn/ui components
- NestJS + Prisma (PostgreSQL)
- Stellar network (Horizon testnet/mainnet)

## 🧭 GrantFox & Contributors

This project is being prepared to run on **GrantFox (grantfox.xyz)** so that:
- Grants can fund continued development of Invoisio on Stellar
- Contributors can help improve the app (AI, UX, payment flows)
- Projects using GrantFox can plug in a privacy‑first invoicing flow

## 🗺️ Roadmap

- [ ] Full invoice CRUD and client portal
- [ ] Advanced AI invoice suggestions
- [ ] Stellar payment watcher and memo‑based reconciliation
- [ ] Multi‑asset support (more tokens on Stellar)
- [ ] Analytics dashboard and reporting
- [ ] PDF export and email delivery

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m "feat: add amazing feature"`
4. Push: `git push origin feature/amazing-feature`
5. Open a PR

## 📄 License

MIT — see `LICENSE`.

## 🙏 Acknowledgments

- https://stellar.org/ — Stellar network
- https://developers.stellar.org/ — Stellar docs and Horizon
- https://nextjs.org/ — React framework
- https://tailwindcss.com/ — utility‑first styling
- https://www.radix-ui.com/ — accessible primitives

---

<div align="center">
  <p>Built with ❤️ for freelancers on Stellar</p>
  <p><a href="#-invoisio-%E2%80%94-privacy%E2%80%91focused-ai-invoice-generator-on-stellar">Back to Top</a></p>
</div>
