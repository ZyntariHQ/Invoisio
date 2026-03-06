# Legacy Webapp Setup & Development Workflow

> **Complete guide for setting up and developing the Invoisio legacy webapp**

This document provides step-by-step instructions for setting up the legacy webapp (`legacy/webapp`), understanding its architecture, and contributing to the codebase.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Linting & Formatting](#linting--formatting)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18.x or higher | JavaScript runtime |
| **npm** | 9.x or higher | Package manager (comes with Node.js) |
| **pnpm** (optional) | 8.x or higher | Alternative package manager |
| **Git** | Latest | Version control |
| **EVM Wallet** | - | MetaMask or Coinbase Wallet for testing |

### Verify Installation

```bash
node --version   # Should show v18.x or higher
npm --version    # Should show 9.x or higher
```

### Optional: Install pnpm

```bash
npm install -g pnpm
```

---

## Installation

### 1. Navigate to the Webapp Directory

```bash
cd legacy/webapp
```

### 2. Install Dependencies

Choose your preferred package manager:

```bash
# Using npm
npm install

# Using pnpm (recommended for faster installs)
pnpm install

# Using yarn
yarn install
```

This will install all dependencies listed in [`package.json`](../webapp/package.json), including:
- Next.js 14.2.16 (App Router)
- React 18
- TypeScript 5
- Tailwind CSS 4.1.9
- Radix UI components
- Wagmi & Coinbase OnchainKit for Web3 integration

### 3. Start the Development Server

```bash
npm run dev
```

The application will be available at **http://localhost:3000**

---

## Environment Variables

The webapp uses environment variables for configuration. Create a `.env.local` file in the `legacy/webapp` directory:

```bash
touch .env.local
```

### Required Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NEXT_PUBLIC_API_BASE` | Backend API base URL | `http://localhost:3001` | `https://api.invoisio.com` |

### Optional Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | Blockchain network ID | `8453` (Base) | `84532` (Base Sepolia) |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect project ID | - | `abc123...` |

### Example `.env.local` File

```env
# Backend API
NEXT_PUBLIC_API_BASE=http://localhost:3001

# Optional: Blockchain Configuration
NEXT_PUBLIC_CHAIN_ID=8453
```

### Where Environment Variables Are Used

- **API Configuration**: [`lib/api.ts`](../webapp/lib/api.ts), [`lib/axios.ts`](../webapp/lib/axios.ts), [`utils/api-config.ts`](../webapp/utils/api-config.ts)
- **Wagmi Configuration**: [`lib/wagmi.ts`](../webapp/lib/wagmi.ts)
- **Next.js Config**: [`next.config.mjs`](../webapp/next.config.mjs)

---

## Available Scripts

All scripts are defined in [`package.json`](../webapp/package.json):

| Script | Command | Description |
|--------|---------|-------------|
| **dev** | `npm run dev` | Start development server on http://localhost:3000 |
| **build** | `npm run build` | Build production-ready application |
| **start** | `npm run start` | Start production server (requires build first) |
| **lint** | `npm run lint` | Run ESLint to check code quality |

### Detailed Script Usage

#### Development Mode

```bash
npm run dev
```

- Starts Next.js development server with hot reload
- Enables React Fast Refresh
- Shows detailed error messages
- Runs on port 3000 by default

#### Production Build

```bash
npm run build
npm run start
```

- Creates optimized production bundle
- Minifies JavaScript and CSS
- Generates static pages where possible
- Runs production server on port 3000

#### Type Checking

```bash
npx tsc --noEmit
```

- Checks TypeScript types without emitting files
- Useful for catching type errors before build

---

## Project Structure

```
legacy/webapp/
├── app/                          # Next.js App Router (pages & layouts)
│   ├── create/                   # Invoice creation page
│   ├── dashboard/                # User dashboard
│   ├── invoices/                 # Invoice management pages
│   ├── payment/                  # Payment processing pages
│   ├── preview/                  # Invoice preview page
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Landing page
│   └── providers.tsx             # Context providers wrapper
│
├── components/                   # Reusable React components
│   ├── ui/                       # Shadcn/ui base components
│   ├── crypto-payment.tsx        # Crypto payment widget
│   ├── invoice-preview.tsx       # Invoice preview component
│   ├── navigation.tsx            # Main navigation bar
│   ├── theme-provider.tsx        # Dark/light theme provider
│   ├── wallet-connect-modal.tsx  # Wallet connection modal
│   └── ...                       # Feature-specific components
│
├── hooks/                        # Custom React hooks
│   ├── use-auth-store.ts         # Authentication state management
│   ├── use-evm-wallet.ts         # EVM wallet integration
│   ├── use-invoice-store.ts      # Invoice state management
│   ├── use-payment-store.ts      # Payment state management
│   └── use-mobile.ts             # Mobile detection hook
│
├── lib/                          # Utility libraries & configurations
│   ├── api.ts                    # API client (fetch-based)
│   ├── axios.ts                  # Axios instance with interceptors
│   ├── wagmi.ts                  # Wagmi Web3 configuration
│   ├── utils.ts                  # General utility functions
│   └── pdf-generator.tsx         # PDF generation utilities
│
├── utils/                        # Helper utilities
│   ├── api-config.ts             # API configuration constants
│   ├── basename.ts               # Base name utilities
│   └── get-cookie.ts             # Cookie management
│
├── styles/                       # Additional stylesheets
│   ├── globals.css               # Global CSS variables
│   └── neumorphic.css            # Neumorphic design styles
│
├── types/                        # TypeScript type definitions
│   ├── user.ts                   # User-related types
│   └── *.d.ts                    # Module declarations
│
├── public/                       # Static assets
│   ├── assest/                   # Images and icons
│   ├── wallets/                  # Wallet icons
│   ├── manifest.webmanifest      # PWA manifest
│   └── sw.js                     # Service worker
│
├── stubs/                        # Webpack alias stubs
│   └── empty.js                  # Empty module for native deps
│
├── next.config.mjs               # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── postcss.config.mjs            # PostCSS configuration
├── components.json               # Shadcn/ui configuration
└── package.json                  # Dependencies & scripts
```

### Key Directories Explained

- **`app/`**: Next.js 14 App Router structure. Each folder represents a route.
- **`components/`**: Reusable UI components. The `ui/` subfolder contains Shadcn/ui primitives.
- **`hooks/`**: Custom React hooks for state management and side effects.
- **`lib/`**: Core utilities and third-party library configurations.
- **`styles/`**: Global CSS and custom design system styles.
- **`types/`**: TypeScript type definitions and module declarations.

---

## Development Workflow

### 1. Start the Backend API

The webapp requires the backend API to be running. See [`api-endpoints-auth.md`](./api-endpoints-auth.md) for backend setup.

```bash
# In a separate terminal, from the project root
cd backend
npm install
npm run start:dev
```

The backend should be running on **http://localhost:3001**

### 2. Start the Webapp

```bash
cd legacy/webapp
npm run dev
```

### 3. Connect Your Wallet

1. Open http://localhost:3000
2. Click "Connect Wallet" in the navigation
3. Choose Coinbase Wallet or MetaMask
4. Approve the connection request

### 4. Making Changes

- **Components**: Edit files in `components/` and see changes instantly
- **Pages**: Modify files in `app/` to update routes
- **Styles**: Update Tailwind classes or edit `styles/` files
- **API Calls**: Modify `lib/api.ts` or `lib/axios.ts`

### 5. Testing Your Changes

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build test
npm run build
```

---

## Linting & Formatting

### Run ESLint

```bash
npm run lint
```

This checks for:
- Code quality issues
- React best practices
- Next.js-specific rules
- TypeScript errors

### Fix Linting Errors Automatically

```bash
npm run lint -- --fix
```

### Common Linting Issues & Fixes

| Issue | Fix |
|-------|-----|
| `'React' must be in scope` | Not needed in Next.js 14+ (auto-imported) |
| `img elements must have alt` | Add `alt=""` or descriptive text |
| `Unexpected console statement` | Remove or use `// eslint-disable-next-line` |
| `Missing return type` | Add explicit return type to functions |

### TypeScript Errors

```bash
# Check types without building
npx tsc --noEmit

# Check specific file
npx tsc --noEmit path/to/file.ts
```

---

## Troubleshooting

### Common Issues

#### 1. Port 3000 Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run dev
```

#### 2. Module Not Found Errors

**Error**: `Module not found: Can't resolve '@/components/...'`

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next
npm run dev
```

#### 3. Wallet Connection Fails

**Error**: Wallet doesn't connect or shows errors

**Solution**:
- Ensure you're using a supported wallet (Coinbase Wallet recommended)
- Check that you're on the correct network (Base or Base Sepolia)
- Clear browser cache and localStorage
- Check [`lib/wagmi.ts`](../webapp/lib/wagmi.ts) configuration

#### 4. API Requests Fail

**Error**: `API 404` or `Network Error`

**Solution**:
- Verify backend is running on http://localhost:3001
- Check `NEXT_PUBLIC_API_BASE` in `.env.local`
- Verify CORS is enabled in backend
- Check network tab in browser DevTools

#### 5. Build Errors

**Error**: Build fails with TypeScript or ESLint errors

**Solution**:
```bash
# The build ignores errors by default (see next.config.mjs)
# To fix properly:
npm run lint -- --fix
npx tsc --noEmit

# Check next.config.mjs settings:
# - eslint.ignoreDuringBuilds: true
# - typescript.ignoreBuildErrors: true
```

#### 6. Tailwind Styles Not Working

**Error**: Tailwind classes don't apply

**Solution**:
- Ensure `globals.css` is imported in `app/layout.tsx`
- Check [`postcss.config.mjs`](../webapp/postcss.config.mjs) is correct
- Clear `.next` cache: `rm -rf .next && npm run dev`
- Verify Tailwind v4 syntax (uses `@tailwindcss/postcss`)

#### 7. Hydration Errors

**Error**: `Text content does not match server-rendered HTML`

**Solution**:
- Avoid using `window` or `localStorage` during initial render
- Use `useEffect` for client-only code
- Check theme provider implementation
- Ensure consistent data between server and client

### Next.js Specific Issues

#### Static Generation Errors

If you see errors about static generation:

```bash
# Check if dynamic routes are properly configured
# Ensure data fetching uses proper Next.js patterns
```

#### Image Optimization

Images are unoptimized by default (see `next.config.mjs`). To enable:

```javascript
// next.config.mjs
images: {
  unoptimized: false, // Change to false
}
```

### Getting Help

If you encounter issues not covered here:

1. Check the [Next.js documentation](https://nextjs.org/docs)
2. Review [Tailwind CSS v4 docs](https://tailwindcss.com/docs)
3. Check [Wagmi documentation](https://wagmi.sh/) for Web3 issues
4. Open an issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Your environment (Node version, OS, etc.)

---

## Additional Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Radix UI**: https://www.radix-ui.com/
- **Wagmi**: https://wagmi.sh/
- **Coinbase OnchainKit**: https://onchainkit.xyz/

### Related Documentation

- [API Endpoints & Auth](./api-endpoints-auth.md) - Backend API documentation
- [Database Migrations](./api-database-migrations.md) - Database setup guide
- [Smart Contracts](./contracts-build-deploy.md) - Contract deployment guide

---

**Last Updated**: March 2026  
**Maintainer**: Development Team
