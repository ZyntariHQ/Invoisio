#!/usr/bin/env bash
# =============================================================================
# Invoisio — Contributor Bootstrap Script
# =============================================================================
# Sets up the full development environment for all active workspaces:
#   backend  — NestJS + Prisma + PostgreSQL
#   web      — Next.js 16
#   mobile   — Expo React Native
#   soroban  — Rust Soroban smart contracts
#
# Usage:
#   ./scripts/bootstrap.sh              # bootstrap all workspaces
#   ./scripts/bootstrap.sh backend      # bootstrap backend only
#   ./scripts/bootstrap.sh web          # bootstrap web only
#   ./scripts/bootstrap.sh mobile       # bootstrap mobile only
#   ./scripts/bootstrap.sh soroban      # bootstrap soroban only
#
# Requirements:
#   Node.js 18+, npm, PostgreSQL 14+ (for backend), Rust + Cargo (for soroban)
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ️  ${1}${RESET}"; }
success() { echo -e "${GREEN}✅ ${1}${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  ${1}${RESET}"; }
error()   { echo -e "${RED}❌ ${1}${RESET}" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${RESET}"; \
            echo -e "${BOLD}${CYAN}  ${1}${RESET}"; \
            echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}\n"; }

# ── Repo root ─────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Target selection ──────────────────────────────────────────────────────────
TARGET="${1:-all}"
case "$TARGET" in
  all|backend|web|mobile|soroban) ;;
  *)
    error "Unknown target: '$TARGET'"
    echo "Usage: $0 [all|backend|web|mobile|soroban]"
    exit 1
    ;;
esac

# =============================================================================
# HELPER: require a command to exist
# =============================================================================
require_cmd() {
  local cmd="$1"
  local install_hint="${2:-}"
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    if [[ -n "$install_hint" ]]; then
      echo -e "  Install hint: ${YELLOW}${install_hint}${RESET}"
    fi
    return 1
  fi
  return 0
}

# =============================================================================
# HELPER: copy .env.example → .env if .env does not exist
# =============================================================================
copy_env() {
  local dir="$1"
  local example="${dir}/.env.example"
  local target="${dir}/.env"

  if [[ -f "$target" ]]; then
    info ".env already exists in $(basename "$dir"), skipping copy"
    return 0
  fi

  if [[ ! -f "$example" ]]; then
    warn "No .env.example found in $(basename "$dir")"
    return 0
  fi

  cp "$example" "$target"
  success "Copied .env.example → .env in $(basename "$dir")"
  warn "Review ${target} and fill in any blank values before running the app"
}

# =============================================================================
# HELPER: create mobile .env if it doesn't exist
# =============================================================================
create_mobile_env() {
  local target="${REPO_ROOT}/mobile/.env"

  if [[ -f "$target" ]]; then
    info ".env already exists in mobile, skipping creation"
    return 0
  fi

  cat > "$target" <<'EOF'
# Mobile app environment variables
# Fill in the values below before running the app

# Backend API URL (e.g. http://localhost:3001 for local dev)
API_URL=http://localhost:3001

# Stellar network passphrase
# Testnet: "Test SDF Network ; September 2015"
# Mainnet: "Public Global Stellar Network ; September 2015"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Reown (WalletConnect) project ID — get yours at https://cloud.reown.com
REOWN_PROJECT_ID=your_reown_project_id_here

# App display name
APP_NAME=Invoisio
EOF

  success "Created mobile/.env with required variables"
  warn "Edit mobile/.env and set API_URL and REOWN_PROJECT_ID before running the app"
}

# =============================================================================
# WORKSPACE: backend
# =============================================================================
bootstrap_backend() {
  header "Backend (NestJS + Prisma + PostgreSQL)"

  local dir="${REPO_ROOT}/backend"
  local failed=0

  # ── Prerequisites ──────────────────────────────────────────────────────────
  info "Checking prerequisites..."

  require_cmd node "https://nodejs.org/en/download  (Node.js 18+)" || failed=1
  require_cmd npm  "Comes with Node.js" || failed=1

  if command -v node &>/dev/null; then
    local node_ver
    node_ver=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1 || echo "old")
    if [[ "$node_ver" == "old" ]] || ! node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" &>/dev/null; then
      error "Node.js 18+ required. Current: $(node --version)"
      failed=1
    else
      success "Node.js $(node --version)"
    fi
  fi

  # PostgreSQL check (non-fatal — Docker is a valid alternative)
  if command -v psql &>/dev/null; then
    success "PostgreSQL client: $(psql --version | head -n1)"
  else
    warn "psql not found — make sure PostgreSQL is accessible (local or Docker)"
    warn "Docker alternative: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16"
  fi

  if [[ "$failed" -eq 1 ]]; then
    error "Backend prerequisites not met. Fix the issues above and re-run."
    return 1
  fi

  # ── Environment ────────────────────────────────────────────────────────────
  info "Setting up environment..."
  copy_env "$dir"

  # ── Install dependencies ───────────────────────────────────────────────────
  info "Installing npm dependencies..."
  npm install --prefix "$dir"
  success "npm install complete"

  # ── Prisma generate ────────────────────────────────────────────────────────
  info "Generating Prisma client..."
  (cd "$dir" && npx prisma generate)
  success "Prisma client generated"

  # ── Summary ────────────────────────────────────────────────────────────────
  echo ""
  success "Backend ready!"
  echo -e "${BOLD}Next steps:${RESET}"
  echo "  1. Ensure PostgreSQL is running and backend/.env DATABASE_URL is correct"
  echo "  2. cd backend && npx prisma migrate dev    # apply DB migrations"
  echo "  3. cd backend && npm run start:dev          # start dev server on :3001"
  echo ""
}

# =============================================================================
# WORKSPACE: web
# =============================================================================
bootstrap_web() {
  header "Web (Next.js 16)"

  local dir="${REPO_ROOT}/web"
  local failed=0

  # ── Prerequisites ──────────────────────────────────────────────────────────
  info "Checking prerequisites..."

  require_cmd node "https://nodejs.org/en/download  (Node.js 18+)" || failed=1
  require_cmd npm  "Comes with Node.js" || failed=1

  if command -v node &>/dev/null; then
    if ! node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" &>/dev/null; then
      error "Node.js 18+ required. Current: $(node --version)"
      failed=1
    else
      success "Node.js $(node --version)"
    fi
  fi

  if [[ "$failed" -eq 1 ]]; then
    error "Web prerequisites not met. Fix the issues above and re-run."
    return 1
  fi

  # ── Install dependencies ───────────────────────────────────────────────────
  info "Installing npm dependencies..."
  npm install --prefix "$dir"
  success "npm install complete"

  # ── Summary ────────────────────────────────────────────────────────────────
  echo ""
  success "Web ready!"
  echo -e "${BOLD}Next steps:${RESET}"
  echo "  1. cd web && npm run dev    # start dev server on http://localhost:3000"
  echo ""
}

# =============================================================================
# WORKSPACE: mobile
# =============================================================================
bootstrap_mobile() {
  header "Mobile (Expo React Native)"

  local dir="${REPO_ROOT}/mobile"
  local failed=0

  # ── Prerequisites ──────────────────────────────────────────────────────────
  info "Checking prerequisites..."

  require_cmd node "https://nodejs.org/en/download  (Node.js 18+)" || failed=1
  require_cmd npm  "Comes with Node.js" || failed=1

  if command -v node &>/dev/null; then
    if ! node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" &>/dev/null; then
      error "Node.js 18+ required. Current: $(node --version)"
      failed=1
    else
      success "Node.js $(node --version)"
    fi
  fi

  if [[ "$failed" -eq 1 ]]; then
    error "Mobile prerequisites not met. Fix the issues above and re-run."
    return 1
  fi

  # ── Environment ────────────────────────────────────────────────────────────
  info "Setting up environment..."
  create_mobile_env

  # ── Install dependencies ───────────────────────────────────────────────────
  info "Installing npm dependencies..."
  npm install --prefix "$dir"
  success "npm install complete"

  # ── Check Expo CLI ─────────────────────────────────────────────────────────
  if ! command -v expo &>/dev/null && ! npx expo --version &>/dev/null 2>&1; then
    warn "Expo CLI not found globally — you can still use 'npx expo'"
    info "To install globally: npm install -g expo-cli"
  else
    success "Expo CLI available"
  fi

  # ── Summary ────────────────────────────────────────────────────────────────
  echo ""
  success "Mobile ready!"
  echo -e "${BOLD}Next steps:${RESET}"
  echo "  1. Edit mobile/.env — set API_URL and REOWN_PROJECT_ID"
  echo "  2. cd mobile && npx expo start    # start Expo dev server"
  echo "  3. Scan the QR code with Expo Go app (iOS/Android)"
  echo "     or press 'a' for Android emulator / 'i' for iOS simulator"
  echo ""
}

# =============================================================================
# WORKSPACE: soroban
# =============================================================================
bootstrap_soroban() {
  header "Soroban (Rust Smart Contracts)"

  local dir="${REPO_ROOT}/soroban"
  local failed=0

  # ── Prerequisites ──────────────────────────────────────────────────────────
  info "Checking prerequisites..."

  # Rust
  if require_cmd rustc "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"; then
    success "Rust: $(rustc --version)"
  else
    failed=1
  fi

  if require_cmd cargo "Comes with Rust — see above" ; then
    success "Cargo: $(cargo --version)"
  else
    failed=1
  fi

  if require_cmd rustup "Comes with Rust — see above"; then
    success "rustup: $(rustup --version 2>&1 | head -n1)"
  else
    failed=1
  fi

  if [[ "$failed" -eq 1 ]]; then
    error "Rust toolchain not found. Install it first, then re-run."
    echo ""
    echo -e "  ${YELLOW}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${RESET}"
    echo -e "  ${YELLOW}source \"\$HOME/.cargo/env\"${RESET}"
    return 1
  fi

  # wasm32v1-none target
  info "Checking wasm32v1-none target..."
  if rustup target list --installed 2>/dev/null | grep -q "wasm32v1-none"; then
    success "wasm32v1-none target already installed"
  else
    info "Installing wasm32v1-none target..."
    rustup target add wasm32v1-none
    success "wasm32v1-none target installed"
  fi

  # Stellar CLI
  info "Checking Stellar CLI..."
  if command -v stellar &>/dev/null; then
    success "Stellar CLI: $(stellar --version | head -n1)"
  else
    warn "Stellar CLI not found — required to build, deploy, and invoke contracts"
    echo ""
    echo -e "  Install Stellar CLI:"
    echo -e "  ${YELLOW}cargo install --locked stellar-cli --features opt${RESET}"
    echo ""
    warn "Skipping Stellar CLI install (run the command above manually)"
    warn "You can still compile and test locally without it using 'cargo build' and 'cargo test'"
  fi

  # ── Verify contract compiles ───────────────────────────────────────────────
  info "Verifying contract compiles (cargo check)..."
  if (cd "$dir" && cargo check --quiet 2>&1); then
    success "Contract compiles successfully"
  else
    error "cargo check failed — see output above"
    return 1
  fi

  # ── Summary ────────────────────────────────────────────────────────────────
  echo ""
  success "Soroban ready!"
  echo -e "${BOLD}Next steps:${RESET}"
  echo "  1. cd soroban && ./build.sh          # compile to WASM"
  echo "  2. cd soroban && cargo test           # run unit tests (no network)"
  echo "  3. cd soroban && ./deploy.sh          # deploy to Stellar testnet"
  echo ""
  echo -e "  ${CYAN}Full docs: soroban/README.md${RESET}"
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  echo ""
  echo -e "${BOLD}${CYAN}🧾 Invoisio — Contributor Bootstrap${RESET}"
  echo -e "${CYAN}   Target: ${BOLD}${TARGET}${RESET}"
  echo ""

  local overall_failed=0

  run_workspace() {
    local ws="$1"
    local fn="bootstrap_${ws}"
    if ! "$fn"; then
      overall_failed=1
      error "${ws} bootstrap failed"
    fi
  }

  case "$TARGET" in
    all)
      run_workspace backend
      run_workspace web
      run_workspace mobile
      run_workspace soroban
      ;;
    *)
      run_workspace "$TARGET"
      ;;
  esac

  echo ""
  if [[ "$overall_failed" -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}🎉 Bootstrap complete! Happy hacking.${RESET}"
    echo ""
    echo -e "${CYAN}Docs & guides:${RESET}"
    echo "  CONTRIBUTING.md       — contribution guide"
    echo "  backend/README.md     — backend setup details"
    echo "  soroban/README.md     — Soroban build/deploy/invoke"
    echo "  mobile/SMOKE_TEST_CHECKLIST.md — mobile smoke tests"
  else
    echo -e "${BOLD}${RED}Bootstrap finished with errors. Fix the issues above and re-run.${RESET}"
    exit 1
  fi
}

main
