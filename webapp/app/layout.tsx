import type React from "react"
import type { Metadata } from "next"
import { Inter, Poppins } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { Navigation } from "@/components/navigation"
import { ThemeProvider } from "@/components/theme-provider"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import "./globals.css"

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
  themeColor: "#0ea5e9",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans ${inter.variable} ${poppins.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <Navigation />
          <Suspense fallback={null}>{children}</Suspense>
          <Analytics />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
