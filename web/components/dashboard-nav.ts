import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, ReceiptText, Settings } from 'lucide-react';

export interface DashboardNavItem {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    description: 'Overview and wallet health',
    icon: LayoutDashboard,
  },
  {
    label: 'Invoices',
    href: '/dashboard/invoices',
    description: 'Create and manage invoices',
    icon: ReceiptText,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    description: 'Wallet and merchant preferences',
    icon: Settings,
  },
];

export function isDashboardNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}