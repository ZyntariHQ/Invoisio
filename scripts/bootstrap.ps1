# =============================================================================
# Invoisio — Contributor Bootstrap Script (PowerShell)
# =============================================================================
# Sets up the full development environment for all active workspaces:
#   backend  — NestJS + Prisma + PostgreSQL
#   web      — Next.js 16
#   mobile   — Expo React Native
#   soroban  — Rust Soroban smart contracts
#
# Usage:
#   .\scripts\bootstrap.ps1              # bootstrap all workspaces
#   .\scripts\bootstrap.ps1 -Target backend   # backend only
#   .\scripts\bootstrap.ps1 -Target web       # web only
#   .\scripts\bootstrap.ps1 -Target mobile    # mobile only
#   .\scripts\bootstrap.ps1 -Target soroban   # soroban only
#
# Requirements:
#   Node.js 18+, npm, PostgreSQL 14+ (for backend), Rust + Cargo (for soroban)
# =============================================================================

[CmdletBinding()]
param(
    [ValidateSet("all","backend","web","mobile","soroban")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Info    { param($Msg) Write-Host "  ℹ️  $Msg" -ForegroundColor Cyan }
function Write-Success { param($Msg) Write-Host "  ✅  $Msg" -ForegroundColor Green }
function Write-Warn    { param($Msg) Write-Host "  ⚠️  $Msg" -ForegroundColor Yellow }
function Write-Err     { param($Msg) Write-Host "  ❌  $Msg" -ForegroundColor Red }
function Write-Header  {
    param($Msg)
    Write-Host ""
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Msg" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

# ── Repo root ─────────────────────────────────────────────────────────────────
$RepoRoot = Split-Path -Parent $PSScriptRoot

# =============================================================================
# HELPER: Check if a command exists
# =============================================================================
function Test-Command {
    param(
        [string]$Name,
        [string]$InstallHint = ""
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Err "Required command not found: $Name"
        if ($InstallHint) {
            Write-Host "    Install hint: $InstallHint" -ForegroundColor Yellow
        }
        return $false
    }
    return $true
}

# =============================================================================
# HELPER: Verify Node.js version >= 18
# =============================================================================
function Test-NodeVersion {
    $verStr = (node --version 2>&1) -replace "v",""
    $major  = [int]($verStr.Split(".")[0])
    if ($major -lt 18) {
        Write-Err "Node.js 18+ required. Current: v$verStr"
        return $false
    }
    Write-Success "Node.js v$verStr"
    return $true
}

# =============================================================================
# HELPER: copy .env.example → .env if .env does not exist
# =============================================================================
function Copy-EnvFile {
    param([string]$Dir)
    $example = Join-Path $Dir ".env.example"
    $target  = Join-Path $Dir ".env"

    if (Test-Path $target) {
        Write-Info ".env already exists in $(Split-Path -Leaf $Dir), skipping copy"
        return
    }
    if (-not (Test-Path $example)) {
        Write-Warn "No .env.example found in $(Split-Path -Leaf $Dir)"
        return
    }
    Copy-Item $example $target
    Write-Success "Copied .env.example → .env in $(Split-Path -Leaf $Dir)"
    Write-Warn "Review $target and fill in any blank values before running the app"
}

# =============================================================================
# HELPER: create mobile .env if it doesn't exist
# =============================================================================
function New-MobileEnv {
    $target = Join-Path $RepoRoot "mobile\.env"
    if (Test-Path $target) {
        Write-Info ".env already exists in mobile, skipping creation"
        return
    }

    $content = @"
# Mobile app environment variables
# Fill in the values below before running the app

# Backend API URL (e.g. http://localhost:3001 for local dev)
API_URL=http://localhost:3001

# Stellar network passphrase
# Testnet: "Test SDF Network ; September 2015"
# Mainnet: "Public Global Stellar Network ; September 2015"
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Reown (WalletConnect) project ID — get yours at https://cloud.reown.com
REOWN_PROJECT_ID=your_reown_project_id_here

# App display name
APP_NAME=Invoisio
"@
    Set-Content -Path $target -Value $content -Encoding UTF8
    Write-Success "Created mobile\.env with required variables"
    Write-Warn "Edit mobile\.env and set API_URL and REOWN_PROJECT_ID before running the app"
}

# =============================================================================
# WORKSPACE: backend
# =============================================================================
function Invoke-BackendBootstrap {
    Write-Header "Backend (NestJS + Prisma + PostgreSQL)"
    $dir    = Join-Path $RepoRoot "backend"
    $failed = $false

    # ── Prerequisites ──────────────────────────────────────────────────────
    Write-Info "Checking prerequisites..."

    if (-not (Test-Command "node" "https://nodejs.org/en/download  (Node.js 18+)")) { $failed = $true }
    if (-not (Test-Command "npm"  "Comes with Node.js"))                            { $failed = $true }

    if ((Get-Command "node" -ErrorAction SilentlyContinue) -and -not $failed) {
        if (-not (Test-NodeVersion)) { $failed = $true }
    }

    # PostgreSQL — non-fatal
    if (Get-Command "psql" -ErrorAction SilentlyContinue) {
        $psqlVer = (psql --version 2>&1)
        Write-Success "PostgreSQL client: $psqlVer"
    } else {
        Write-Warn "psql not found — make sure PostgreSQL is accessible (local or Docker)"
        Write-Warn "Docker alternative: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16"
    }

    if ($failed) {
        Write-Err "Backend prerequisites not met. Fix the issues above and re-run."
        return $false
    }

    # ── Environment ────────────────────────────────────────────────────────
    Write-Info "Setting up environment..."
    Copy-EnvFile $dir

    # ── Install dependencies ───────────────────────────────────────────────
    Write-Info "Installing npm dependencies..."
    Push-Location $dir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-Success "npm install complete"

        # ── Prisma generate ────────────────────────────────────────────────
        Write-Info "Generating Prisma client..."
        npx prisma generate
        if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
        Write-Success "Prisma client generated"
    } finally {
        Pop-Location
    }

    # ── Summary ────────────────────────────────────────────────────────────
    Write-Host ""
    Write-Success "Backend ready!"
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. Ensure PostgreSQL is running and backend\.env DATABASE_URL is correct"
    Write-Host "    2. cd backend; npx prisma migrate dev    # apply DB migrations"
    Write-Host "    3. cd backend; npm run start:dev          # start dev server on :3001"
    Write-Host ""
    return $true
}

# =============================================================================
# WORKSPACE: web
# =============================================================================
function Invoke-WebBootstrap {
    Write-Header "Web (Next.js 16)"
    $dir    = Join-Path $RepoRoot "web"
    $failed = $false

    Write-Info "Checking prerequisites..."
    if (-not (Test-Command "node" "https://nodejs.org/en/download  (Node.js 18+)")) { $failed = $true }
    if (-not (Test-Command "npm"  "Comes with Node.js"))                            { $failed = $true }

    if ((Get-Command "node" -ErrorAction SilentlyContinue) -and -not $failed) {
        if (-not (Test-NodeVersion)) { $failed = $true }
    }

    if ($failed) {
        Write-Err "Web prerequisites not met. Fix the issues above and re-run."
        return $false
    }

    Write-Info "Installing npm dependencies..."
    Push-Location $dir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-Success "npm install complete"
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Success "Web ready!"
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. cd web; npm run dev    # start dev server on http://localhost:3000"
    Write-Host ""
    return $true
}

# =============================================================================
# WORKSPACE: mobile
# =============================================================================
function Invoke-MobileBootstrap {
    Write-Header "Mobile (Expo React Native)"
    $dir    = Join-Path $RepoRoot "mobile"
    $failed = $false

    Write-Info "Checking prerequisites..."
    if (-not (Test-Command "node" "https://nodejs.org/en/download  (Node.js 18+)")) { $failed = $true }
    if (-not (Test-Command "npm"  "Comes with Node.js"))                            { $failed = $true }

    if ((Get-Command "node" -ErrorAction SilentlyContinue) -and -not $failed) {
        if (-not (Test-NodeVersion)) { $failed = $true }
    }

    if ($failed) {
        Write-Err "Mobile prerequisites not met. Fix the issues above and re-run."
        return $false
    }

    Write-Info "Setting up environment..."
    New-MobileEnv

    Write-Info "Installing npm dependencies..."
    Push-Location $dir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-Success "npm install complete"
    } finally {
        Pop-Location
    }

    # Expo CLI check
    if (-not (Get-Command "expo" -ErrorAction SilentlyContinue)) {
        Write-Warn "Expo CLI not found globally — you can still use 'npx expo'"
        Write-Info "To install globally: npm install -g expo-cli"
    } else {
        Write-Success "Expo CLI available"
    }

    Write-Host ""
    Write-Success "Mobile ready!"
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. Edit mobile\.env — set API_URL and REOWN_PROJECT_ID"
    Write-Host "    2. cd mobile; npx expo start    # start Expo dev server"
    Write-Host "    3. Scan the QR code with Expo Go (iOS/Android)"
    Write-Host "       or press 'a' for Android emulator / 'i' for iOS simulator"
    Write-Host ""
    return $true
}

# =============================================================================
# WORKSPACE: soroban
# =============================================================================
function Invoke-SorobanBootstrap {
    Write-Header "Soroban (Rust Smart Contracts)"
    $dir    = Join-Path $RepoRoot "soroban"
    $failed = $false

    Write-Info "Checking prerequisites..."

    # Rust toolchain
    if (-not (Test-Command "rustc" "https://rustup.rs  — run: winget install Rustlang.Rustup")) { $failed = $true }
    if (-not (Test-Command "cargo" "Comes with Rust — see above"))                               { $failed = $true }
    if (-not (Test-Command "rustup" "Comes with Rust — see above"))                              { $failed = $true }

    if ($failed) {
        Write-Err "Rust toolchain not found. Install it first, then re-run."
        Write-Host ""
        Write-Host "  Windows (recommended):" -ForegroundColor Yellow
        Write-Host "    winget install Rustlang.Rustup" -ForegroundColor Yellow
        Write-Host "  or download the installer from https://rustup.rs" -ForegroundColor Yellow
        return $false
    }

    $rustVer  = (rustc --version 2>&1)
    $cargoVer = (cargo --version 2>&1)
    Write-Success "Rust:  $rustVer"
    Write-Success "Cargo: $cargoVer"

    # wasm32v1-none target
    Write-Info "Checking wasm32v1-none target..."
    $installedTargets = (rustup target list --installed 2>&1)
    if ($installedTargets -match "wasm32v1-none") {
        Write-Success "wasm32v1-none target already installed"
    } else {
        Write-Info "Installing wasm32v1-none target..."
        rustup target add wasm32v1-none
        if ($LASTEXITCODE -ne 0) { throw "Failed to add wasm32v1-none target" }
        Write-Success "wasm32v1-none target installed"
    }

    # Stellar CLI
    Write-Info "Checking Stellar CLI..."
    if (Get-Command "stellar" -ErrorAction SilentlyContinue) {
        $stellarVer = (stellar --version 2>&1 | Select-Object -First 1)
        Write-Success "Stellar CLI: $stellarVer"
    } else {
        Write-Warn "Stellar CLI not found — required to build, deploy, and invoke contracts"
        Write-Host ""
        Write-Host "  Install Stellar CLI:" -ForegroundColor Yellow
        Write-Host "    cargo install --locked stellar-cli --features opt" -ForegroundColor Yellow
        Write-Host ""
        Write-Warn "Skipping Stellar CLI install (run the command above manually)"
        Write-Warn "You can still compile and test locally without it using 'cargo build' / 'cargo test'"
    }

    # cargo check
    Write-Info "Verifying contract compiles (cargo check)..."
    Push-Location $dir
    try {
        cargo check --quiet
        if ($LASTEXITCODE -ne 0) { throw "cargo check failed" }
        Write-Success "Contract compiles successfully"
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Success "Soroban ready!"
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. cd soroban; .\build.sh       # compile to WASM  (use WSL or Git Bash on Windows)"
    Write-Host "    2. cd soroban; cargo test        # run unit tests (no network needed)"
    Write-Host "    3. cd soroban; .\deploy.sh       # deploy to Stellar testnet  (WSL/Git Bash)"
    Write-Host ""
    Write-Host "  Note: The .sh shell scripts require WSL 2 or Git Bash on Windows." -ForegroundColor Cyan
    Write-Host "        Full docs: soroban\README.md" -ForegroundColor Cyan
    Write-Host ""
    return $true
}

# =============================================================================
# MAIN
# =============================================================================
Write-Host ""
Write-Host "🧾 Invoisio — Contributor Bootstrap" -ForegroundColor Cyan -NoNewline
Write-Host "  (Target: $Target)" -ForegroundColor White
Write-Host ""

$overallFailed = $false

function Invoke-Workspace {
    param([string]$Name)
    $fn = "Invoke-$([System.Globalization.CultureInfo]::CurrentCulture.TextInfo.ToTitleCase($Name))Bootstrap"
    $result = & $fn
    if (-not $result) { $script:overallFailed = $true }
}

switch ($Target) {
    "all" {
        Invoke-Workspace "Backend"
        Invoke-Workspace "Web"
        Invoke-Workspace "Mobile"
        Invoke-Workspace "Soroban"
    }
    default {
        $titleName = [System.Globalization.CultureInfo]::CurrentCulture.TextInfo.ToTitleCase($Target)
        Invoke-Workspace $titleName
    }
}

Write-Host ""
if (-not $overallFailed) {
    Write-Host "🎉 Bootstrap complete! Happy hacking." -ForegroundColor Green
    Write-Host ""
    Write-Host "Docs & guides:" -ForegroundColor Cyan
    Write-Host "  CONTRIBUTING.md                    — contribution guide"
    Write-Host "  backend\README.md                  — backend setup details"
    Write-Host "  soroban\README.md                  — Soroban build/deploy/invoke"
    Write-Host "  mobile\SMOKE_TEST_CHECKLIST.md     — mobile smoke tests"
} else {
    Write-Err "Bootstrap finished with errors. Fix the issues above and re-run."
    exit 1
}
