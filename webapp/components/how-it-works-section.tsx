"use client"

import { Card } from "@/components/ui/card"
import { Wallet, FileText, Zap, Shield, Send } from "lucide-react"

const steps = [
  {
    icon: Wallet,
    title: "Connect Wallet",
    description: "Link your Argent X or Braavos wallet securely to get started",
    step: "01",
  },
  {
    icon: FileText,
    title: "Add Project Details",
    description: "Input your project information and client details",
    step: "02",
  },
  {
    icon: Zap,
    title: "AI Generates Invoice",
    description: "Our AI creates a professional invoice in seconds",
    step: "03",
  },
  {
    icon: Shield,
    title: "ZK Proof Validates",
    description: "Zero-knowledge proofs ensure data privacy and authenticity",
    step: "04",
  },
  {
    icon: Send,
    title: "Send & Get Paid",
    description: "Send invoice and receive payments securely in crypto",
    step: "05",
  },
]

export function HowItWorksSection() {
  return (
    <section className="relative py-24 overflow-hidden" style={{ background: 'var(--nm-background)' }}>
      {/* Background Elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div
        className="absolute bottom-20 right-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl animate-float"
        style={{ animationDelay: "1s" }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6 text-balance">
            How It <span className="text-primary">Works</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Get from project completion to payment in just 5 simple steps
          </p>
        </div>

        <div className="nm-flat rounded-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {steps.map((step, index) => (
              <Card
                key={index}
                className="relative p-6 group bounce-in"
                style={{ 
                   animationDelay: `${index * 0.15}s`,
                   borderRadius: '26px',
                   background: 'var(--card)',
                   boxShadow: '12px 12px 24px rgba(0, 0, 0, 0.15), -12px -12px 24px rgba(255, 255, 255, 0.1)',
                   transform: 'translateY(-2px)'
                 }}
              >
              <div className="absolute top-4 right-4 text-2xl font-bold text-primary/20 font-heading">{step.step}</div>

              <div className="mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
              </div>

              <h3 className="font-heading text-lg font-semibold mb-2 text-balance">{step.title}</h3>
              <p className="text-sm text-muted-foreground text-balance">{step.description}</p>

              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
              )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
