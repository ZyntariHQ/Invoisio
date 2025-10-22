import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Poppins } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
// import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { ThemeProvider } from "@/components/theme-provider"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import dynamic from "next/dynamic"
import "./globals.css"
import Providers from "@/app/providers"
import "@coinbase/onchainkit/styles.css"
import { cookies } from "next/headers"
import ThemeCookieSync from "@/components/theme-cookie-sync"

const ClientToaster = dynamic(() => import("@/components/ui/toaster").then(m => m.Toaster), { ssr: false })
const AppNavigation = dynamic(() => import("@/components/navigation").then(m => m.Navigation), { ssr: false })

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Invoisio - Smart Invoice Generator for Freelancers and Businesses",
  description:
    "Create and send professional invoices easily with our intuitive invoice generator — streamline your billing process today.",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/assest/invoisio_logo.svg",
    apple: "/assest/invoisio_logo.png",
    shortcut: "/assest/invoisio_logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Invoisio",
  },
}

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const themeCookie = cookies().get("theme")?.value
  const htmlClass = themeCookie === "dark" ? "dark" : "light"

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body suppressHydrationWarning className={`font-sans ${inter.variable} ${poppins.variable} antialiased`}>
        {/* Boot loader overlay: shows immediately before JS loads */}
        <div id="nm-boot-loader" className="nm-boot-overlay" aria-live="polite" aria-busy="true">
          <div className="nm-boot-spinner" />
        </div>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange storageKey="theme">
            {/* Keep cookie in sync with active theme so SSR class stays correct */}
            <ThemeCookieSync />
            <AppNavigation />
            {children}
            <Footer />
            <Analytics />
            <ServiceWorkerRegister />
            <ClientToaster />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
