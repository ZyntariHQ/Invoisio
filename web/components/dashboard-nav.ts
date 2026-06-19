import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, ReceiptText, Settings } from 'lucide-react';

export interface DashboardNavItem {
  label: string;
  shortLabel: string;
  href: string;
  description: string;
  icon: LucideIcon;
  badge?: string | number;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: 'Dashboard',
    shortLabel: 'Home',
    href: '/dashboard',
    description: 'Overview and wallet health',
    icon: LayoutDashboard,
  },
  {
    label: 'Invoices',
    shortLabel: 'Invoices',
    href: '/dashboard/invoices',
    description: 'Create and manage invoices',
    icon: ReceiptText,
  },
  {
    label: 'Settings',
    shortLabel: 'Settings',
    href: '/dashboard/settings',
    description: 'Wallet and merchant preferences',
    icon: Settings,
  },
];

export function isDashboardNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}