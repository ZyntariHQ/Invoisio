'use client';

import { ReactNode } from 'react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { RequireAuth } from '@/components/require-auth';

export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <DashboardLayout>{children}</DashboardLayout>
    </RequireAuth>
  );
}
