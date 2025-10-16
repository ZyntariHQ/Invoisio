"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, CreditCard, Shield, Zap, Lock } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: 'var(--nm-background)' }}>
      {/* Background Elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div
        className="absolute bottom-20 right-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl animate-float"
        style={{ animationDelay: "1s" }}
      />

      <div className="relative container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto animate-fade-in-up">
          {/* Main Headline */}
          <div className="p-8 mb-8">
            <h1 className="font-heading text-5xl md:text-7xl font-bold mb-6 text-balance">
              <span className="text-foreground">Effortless, </span>
              <span className="text-primary">Private</span>
              <br />
              <span className="text-foreground">Invoicing for </span>
              <span className="text-primary">Freelancers</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto text-balance leading-relaxed">
              Create professional invoices quickly and easily with AI assistance.
            </p>

            {/* CTA Buttons */}
             <div className="flex justify-center">
               <div className="nm-flat rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-center">
                 <Link href="/create" className="nm-button bg-accent text-accent-foreground font-semibold text-lg flex items-center">
                   Create Invoice
                   <ArrowRight className="ml-2 w-5 h-5" />
                 </Link>
                 <Link href="/payment" className="nm-button bg-primary text-primary-foreground font-semibold text-lg flex items-center">
                   <CreditCard className="mr-2 w-5 h-5" />
                   Payment
                 </Link>
             </div>
           </div>
          </div>
        </div>
      </div>
    </section>
  )
}
