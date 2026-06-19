import { ReactNode } from "react"
import { MerchantDashboardShell } from "@/components/merchant-dashboard-shell"

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <MerchantDashboardShell
      title="Settings"
      description="Manage wallet, profile, and dashboard preferences."
    >
      {children}
    </MerchantDashboardShell>
  )
}
