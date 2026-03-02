"use client"

import { Card } from "@/components/ui/card"
import { Zap, Globe, Shield } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

// Dynamically import Lottie to avoid SSR issues
const Lottie = dynamic(() => import('lottie-react'), { ssr: false })

export function WhyBaseSection() {
  // Load Lottie animation data on client; avoid require('/public/...') which breaks in ESM
  const [lottieData, setLottieData] = useState<any | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/assest/inviosio.json')
        if (!res.ok) return
        const data = await res.json()
        if (active) setLottieData(data)
      } catch {}
    }
    load()
    return () => { active = false }
  }, [])

  return (
    <section className="py-24" style={{ background: 'var(--nm-background)' }}>
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          {/* Main Content Grid */}
          <div className="nm-flat rounded-lg p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Left Side - Single Feature Card */}
              <div className="flex justify-center lg:justify-start">
                <Card className="group p-10 bg-gradient-to-br from-card/80 to-card/40 border-border/50 backdrop-blur-sm transition-all duration-500 hover:-translate-y-2 max-w-lg w-full" style={{ boxShadow: 'none' }}>
                  <div className="text-center space-y-6">
                    <div className="flex justify-center">
                      <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Shield className="w-10 h-10 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-heading text-2xl font-bold mb-4 text-balance">
                        Secure & Private Transactions
                      </h3>
                      <p className="text-muted-foreground leading-relaxed text-balance">
                        Built on Base (EVM), leveraging secure wallet authentication and privacy-preserving flows.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Side - Lottie Animation */}
              <div className="flex justify-center lg:justify-end">
                {lottieData ? (
                  <Lottie animationData={lottieData} loop={true} style={{ width: 320, height: 320 }} />
                ) : (
                  <div className="w-[320px] h-[320px] nm-flat rounded-2xl flex items-center justify-center text-muted-foreground">
                    Loading animation...
                  </div>
                )}
              </div>
            </div>

            {/* Additional features grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
              <Card className="p-6 nm-flat">
                <div className="flex items-center gap-4 mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                  <h3 className="font-heading text-xl font-semibold">Fast Payments</h3>
                </div>
                <p className="text-muted-foreground">Low fees and quick confirmations on Base.</p>
              </Card>

              <Card className="p-6 nm-flat">
                <div className="flex items-center gap-4 mb-4">
                  <Globe className="w-8 h-8 text-primary" />
                  <h3 className="font-heading text-xl font-semibold">Global Access</h3>
                </div>
                <p className="text-muted-foreground">Accept payments from anywhere, anytime.</p>
              </Card>

              <Card className="p-6 nm-flat">
                <div className="flex items-center gap-4 mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                  <h3 className="font-heading text-xl font-semibold">Strong Security</h3>
                </div>
                <p className="text-muted-foreground">Wallet-based identity, signature verification, and secure flows.</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
