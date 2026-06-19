import { ReactNode } from "react"
import { MerchantDashboardShell } from "@/components/merchant-dashboard-shell"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <MerchantDashboardShell
      title="Dashboard"
      description="Welcome back! Here's your invoice overview."
    >
      {children}
    </MerchantDashboardShell>
  )
}
