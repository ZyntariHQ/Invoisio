"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Zap } from "lucide-react"
import Link from "next/link"

export function CTASection() {

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="p-12 bg-card/80 backdrop-blur-sm border-border/50 pop-hover bounce-in">
            <div className="mb-8">
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6 text-balance">
                Be the first to <span className="text-primary">simplify</span> your invoicing
              </h2>
              <p className="text-xl text-muted-foreground text-balance mb-8">
                Join our beta and revolutionize how you handle freelance payments with privacy-first AI technology.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Button
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 pop-button"
                  asChild
                >
                  <Link href="/dashboard">
                    <Zap className="mr-2 w-5 h-5" />
                    Try Invoisio Now
                  </Link>
                </Button>
              </div>
            </div>


          </Card>
        </div>
      </div>
    </section>
  )
}
