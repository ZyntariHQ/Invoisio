# 🧾 Invoisio - Privacy-Focused AI Invoice Generator

> **Effortless, Private Invoicing for Freelancers**

A modern, privacy-first invoice generation platform built for freelancers and small businesses. Powered by AI automation, secured with zero-knowledge proofs, and integrated with Starknet blockchain technology for seamless cryptocurrency payments.

![Next.js](https://img.shields.io/badge/Next.js-14.2.16-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1.9-38B2AC?style=for-the-badge&logo=tailwind-css)
![Starknet](https://img.shields.io/badge/Starknet-Ready-purple?style=for-the-badge)

## ✨ Key Features

### 🤖 **AI-Powered Automation**
- Automatically generate professional invoices with smart templates
- Adaptive templates that adjust to your business needs and client preferences
- Intelligent data extraction and formatting

### 🔒 **Privacy-First with Zero-Knowledge Proofs**
- Your financial data stays completely private
- Zero-knowledge proofs maintain transparency without exposing sensitive information
- Decentralized identity management through wallet authentication

### 💰 **Cryptocurrency Payments**
- Accept crypto payments seamlessly with built-in wallet integration
- Real-time conversion rates and multi-currency support
- Starknet blockchain integration for secure, fast transactions

### 🎨 **Modern UI/UX**
- Beautiful, responsive design with neumorphic styling
- Dark/light theme support
- Mobile-first approach with intuitive navigation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm, yarn, or pnpm
- A Starknet-compatible wallet (Argent X, Braavos)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/invoice-generator-landing.git
   cd invoice-generator-landing
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## 🏗️ Project Structure

```
invoice-generator-landing/
├── app/                    # Next.js App Router
│   ├── clients/           # Client management pages
│   ├── create/            # Invoice creation page
│   ├── dashboard/         # User dashboard
│   ├── invoices/          # Invoice management
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── components/            # Reusable UI components
│   ├── ui/               # Shadcn/ui components
│   ├── features-section.tsx
│   ├── hero-section.tsx
│   ├── navigation.tsx
│   └── ...
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
├── public/               # Static assets
└── styles/               # Global styles
```

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14.2.16 with App Router
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS 4.1.9 with custom neumorphic design
- **UI Components**: Radix UI primitives with Shadcn/ui
- **Icons**: Lucide React
- **Animations**: Custom CSS animations with Tailwind

### State Management & Forms
- **Forms**: React Hook Form with Zod validation
- **State**: React hooks (useState, useEffect)

### Development Tools
- **Package Manager**: npm/yarn/pnpm
- **Linting**: ESLint with Next.js configuration
- **Type Checking**: TypeScript strict mode

## 📱 Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Type checking
npx tsc --noEmit     # Check TypeScript types
```

## 🔐 Authentication

The application uses **wallet-based authentication** for a seamless Web3 experience:

- **No traditional passwords** - Enhanced security through wallet signatures
- **One-click authentication** - Connect wallet to access all features
- **Decentralized identity** - Users own their authentication method
- **Privacy-focused** - No email or personal data required initially

### Supported Wallets
- Argent X
- Braavos
- Other Starknet-compatible wallets

## 🎨 Design System

The application features a custom **neumorphic design system** with:

- **Soft shadows and highlights** for depth perception
- **Consistent spacing and typography** using Geist font family
- **Accessible color palette** with dark/light theme support
- **Responsive breakpoints** for all device sizes

## 🔮 Upcoming Features

- [ ] **Backend API Integration** - Full CRUD operations for invoices
- [ ] **Starknet Smart Contracts** - On-chain invoice verification
- [ ] **AI Invoice Generation** - Advanced template suggestions
- [ ] **Multi-currency Support** - Fiat and crypto payment options
- [ ] **Client Portal** - Dedicated client payment interface
- [ ] **Analytics Dashboard** - Business insights and reporting
- [ ] **Email Integration** - Automated invoice delivery
- [ ] **PDF Export** - Professional invoice downloads

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) for the amazing React framework
- [Tailwind CSS](https://tailwindcss.com/) for utility-first styling
- [Radix UI](https://www.radix-ui.com/) for accessible component primitives
- [Starknet](https://starknet.io/) for blockchain infrastructure
- [Lucide](https://lucide.dev/) for beautiful icons

## 📞 Support

- **Documentation**: [Coming Soon]
- **Issues**: [GitHub Issues](https://github.com/yourusername/invoice-generator-landing/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/invoice-generator-landing/discussions)

---

<div align="center">
  <p>Built with ❤️ for the freelance community</p>
  <p>
    <a href="#-invoisio---privacy-focused-ai-invoice-generator">Back to Top</a>
  </p>
</div>