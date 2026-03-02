import { HeroSection } from "@/components/hero-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { FeaturesSection } from "@/components/features-section"
import { WhyBaseSection } from "@/components/why-base-section"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <WhyBaseSection />
    </main>
  )
}
