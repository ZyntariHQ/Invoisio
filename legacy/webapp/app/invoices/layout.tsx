import { ReactNode } from "react"
import { MerchantDashboardShell } from "@/components/merchant-dashboard-shell"

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return (
    <MerchantDashboardShell
      title="Invoices"
      description="Create, review, and manage all merchant invoices."
    >
      {children}
    </MerchantDashboardShell>
  )
}
