"use client"

import { Github, Twitter, MessageCircle } from "lucide-react"
import Image from "next/image"

export function Footer() {
  return (
    <footer className="py-16 bg-background border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <h3 className="font-heading text-2xl font-bold text-primary mb-4">Invoisio</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Privacy-focused AI invoice generator for freelancers. Built on Base (EVM) with a focus on
                secure, seamless crypto payments.
              </p>

              {/* Social Links */}
              <div className="flex gap-4">
                <a
                  href="#"
                  className="w-10 h-10 bg-muted/50 hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors group"
                >
                  <Twitter className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-muted/50 hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors group"
                >
                  <Github className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-muted/50 hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors group"
                >
                  <MessageCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </a>
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="font-heading font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    How it Works
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Beta Access
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-heading font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Invoisio. All rights reserved.</p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              Built with <span aria-label="love">❤️</span> on
              <a
                href="https://base.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                <Image src="/Base_Logo_0.svg" alt="Base" width={60} height={16} className="h-4 w-auto" style={{ width: 'auto' }} />
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
