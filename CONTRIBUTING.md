# Contributing to Invoisio

Welcome! This guide gets you from a fresh clone to a running development environment in one command.

## Quick bootstrap

### Linux / macOS / WSL

```bash
./scripts/bootstrap.sh          # set up all workspaces
./scripts/bootstrap.sh backend  # backend only
./scripts/bootstrap.sh web      # web only
./scripts/bootstrap.sh mobile   # mobile only
./scripts/bootstrap.sh soroban  # soroban only
```

### Windows (PowerShell)

```powershell
.\scripts\bootstrap.ps1                    # set up all workspaces
.\scripts\bootstrap.ps1 -Target backend   # backend only
.\scripts\bootstrap.ps1 -Target web       # web only
.\scripts\bootstrap.ps1 -Target mobile    # mobile only
.\scripts\bootstrap.ps1 -Target soroban   # soroban only
```

> **Windows note:** The Soroban shell scripts (`build.sh`, `deploy.sh`) require
> **WSL 2** or **Git Bash**. The bootstrap PowerShell script handles everything
> else natively. See [Soroban setup](#soroban-rust-smart-contracts) for details.

The script checks prerequisites, installs dependencies, copies environment
files, and prints exactly what to do next. Errors fail with actionable messages.

---

## Prerequisites

| Tool | Min version | Required by | Install |
|------|-------------|-------------|---------|
| **Node.js** | 18 | backend, web, mobile | [nodejs.org](https://nodejs.org/en/download) |
| **npm** | 9 | backend, web, mobile | Bundled with Node.js |
| **PostgreSQL** | 14 | backend | [postgresql.org](https://www.postgresql.org/download/) or Docker |
| **Rust + Cargo** | stable | soroban | [rustup.rs](https://rustup.rs) / `winget install Rustlang.Rustup` |
| **rustup** | — | soroban | Bundled with Rust |
| **wasm32v1-none target** | — | soroban | Auto-installed by bootstrap |
| **Stellar CLI** | ≥ 22 | soroban deploy | `cargo install --locked stellar-cli --features opt` |

You do **not** need all prerequisites to work on a single workspace — only install what
the workspace you're contributing to requires.

---

## Workspace setup

### Backend (NestJS + Prisma + PostgreSQL)

```bash
# 1. Install dependencies + generate Prisma client
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL

# 3. Run database migrations
npx prisma migrate dev

# 4. Start the dev server (http://localhost:3001)
npm run start:dev
```

Key environment variables in `backend/.env`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `HORIZON_URL` | Stellar Horizon endpoint |
| `STELLAR_NETWORK_PASSPHRASE` | Testnet or Mainnet passphrase |
| `MERCHANT_PUBLIC_KEY` | Stellar G-address for receiving payments |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint |
| `SOROBAN_CONTRACT_ID` | Deployed invoice-payment contract ID |
| `ADMIN_SECRET_KEY` | Contract admin secret key (never commit a real key) |

**Docker alternative for PostgreSQL:**

```bash
docker run -d \
  --name invoisio-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=invoisio_db \
  -p 5432:5432 \
  postgres:16
```

---

### Web (Next.js 16)

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

No `.env` file is required for basic development. The web app talks to the
backend at the URL configured in `web/lib/api-client.ts`.

---

### Mobile (Expo React Native)

```bash
cd mobile
npm install

# Configure environment (created by bootstrap, or manually):
cp /dev/null mobile/.env   # creates empty file — fill in values below
```

Required variables in `mobile/.env`:

| Variable | Description |
|----------|-------------|
| `API_URL` | Backend URL, e.g. `http://localhost:3001` |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase (testnet default) |
| `REOWN_PROJECT_ID` | WalletConnect project ID from [cloud.reown.com](https://cloud.reown.com) |
| `APP_NAME` | App display name (default: `Invoisio`) |

```bash
npx expo start   # start dev server + QR code
```

- **iOS simulator**: press `i`
- **Android emulator**: press `a`
- **Physical device**: scan QR code with [Expo Go](https://expo.dev/go)

Smoke test checklist: [`mobile/SMOKE_TEST_CHECKLIST.md`](mobile/SMOKE_TEST_CHECKLIST.md)

---

### Soroban (Rust Smart Contracts)

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install the wasm32v1-none target (auto-installed by bootstrap)
rustup target add wasm32v1-none

# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Build the contract WASM
cd soroban
./build.sh

# Run unit tests (no network required)
cargo test

# Deploy to Stellar testnet
./deploy.sh
```

**Windows contributors:** Use **WSL 2** for the shell scripts.

```powershell
# Install WSL 2 (run as Administrator)
wsl --install
# Then open a WSL terminal and run the commands above
```

Full Soroban docs: [`soroban/README.md`](soroban/README.md)

---

## Development workflow

### Running everything locally

Start these in separate terminals:

```bash
# Terminal 1 — Backend API
cd backend && npm run start:dev

# Terminal 2 — Web frontend
cd web && npm run dev

# Terminal 3 — Mobile (optional)
cd mobile && npx expo start
```

### Running tests

```bash
# Backend unit tests
cd backend && npm test

# Backend e2e tests (requires running PostgreSQL)
cd backend && npm run test:e2e

# Soroban unit tests (no network needed)
cd soroban && cargo test
```

---

## Git workflow

1. Fork the repo and clone your fork
2. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. Make your changes
4. Run relevant tests before committing
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add amazing feature
   fix: correct invoice amount rounding
   docs: update soroban deployment guide
   chore: bump stellar-sdk to 14.7
   ```
6. Push and open a pull request against `main`

---

## Troubleshooting

### `prisma generate` fails

Make sure you are in the `backend/` directory and `DATABASE_URL` is set in `backend/.env`.

### `wasm32v1-none` target not found

Run `rustup target add wasm32v1-none`. The bootstrap script does this automatically.

### Expo QR code not working

Ensure your phone and computer are on the same Wi-Fi network. Alternatively use
`npx expo start --tunnel` to route through Expo's servers.

### PostgreSQL connection refused

Check that the Postgres service is running:
```bash
# macOS (Homebrew)
brew services start postgresql

# Linux (systemd)
sudo systemctl start postgresql

# Docker
docker start invoisio-postgres
```

### Stellar CLI not found after `cargo install`

Make sure `~/.cargo/bin` is in your `PATH`:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
# Add this line to ~/.bashrc or ~/.zshrc to persist it
```

---

## Project structure

```
./
├── backend/        NestJS API  (invoices, payments, Soroban integration)
├── web/            Next.js 16 web app
├── mobile/         Expo React Native app
├── soroban/        Rust Soroban smart contracts
├── scripts/        Developer tooling (bootstrap.sh, bootstrap.ps1)
└── legacy/         Legacy code kept for reference (not actively developed)
```

---

## Getting help

- Open an issue with the `question` label
- Check existing issues and pull requests before starting work on something new
- For Stellar/Soroban questions: [Stellar Developer Discord](https://discord.gg/stellardev)
