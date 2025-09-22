"use client"

import { Card } from "@/components/ui/card"
import { Zap, Globe, Shield } from "lucide-react"
import dynamic from "next/dynamic"

// Dynamically import Lottie to avoid SSR issues
const Lottie = dynamic(() => import('lottie-react'), { ssr: false })

export function WhyStarknetSection() {
  // Import the Lottie animation data
  const lottieData = require('/public/assest/inviosio.json')

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
                      <p className="text-muted-foreground leading-relaxed text-lg">
                        Experience the perfect blend of Ethereum's security with enhanced privacy features and lightning-fast transaction speeds at a fraction of the cost.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Side - Lottie Animation */}
              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  <div className="relative w-96 h-96 md:w-[500px] md:h-[500px]">
                    <Lottie
                      animationData={lottieData}
                      loop={true}
                      autoplay={true}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
