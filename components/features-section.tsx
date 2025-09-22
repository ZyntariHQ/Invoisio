"use client"

import { Card } from "@/components/ui/card"
import { Bot, Shield, CreditCard } from "lucide-react"

const features = [
  {
    icon: Bot,
    title: "AI-Powered Automation",
    description:
      "Automatically generate professional invoices with smart templates that adapt to your business needs and client preferences.",
    color: "text-primary",
  },
  {
    icon: Shield,
    title: "Privacy-First with ZK Proofs",
    description: "Your financial data stays private with zero-knowledge proofs while maintaining full transparency.",
    color: "text-primary",
  },
  {
    icon: CreditCard,
    title: "Crypto Payments",
    description: "Accept cryptocurrency payments seamlessly with built-in wallet integration and real-time conversion rates.",
    color: "text-primary",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24" style={{ background: 'var(--nm-background)' }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6 text-balance">
            Key <span className="text-primary">Features</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Everything you need to streamline your freelance invoicing workflow
          </p>
        </div>

        <div className="nm-flat rounded-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card
                 key={index}
                 className="p-8 group bounce-in"
                 style={{ 
                    animationDelay: `${index * 0.1}s`,
                    borderRadius: '26px',
                    background: 'var(--card)',
                    boxShadow: '12px 12px 24px rgba(0, 0, 0, 0.15), -12px -12px 24px rgba(255, 255, 255, 0.1)',
                    transform: 'translateY(-2px)'
                  }}
               >
              <div className="mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <feature.icon className={`w-8 h-8 ${feature.color}`} />
                </div>
              </div>

              <h3 className="font-heading text-xl font-semibold mb-4 text-balance">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed text-balance">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
