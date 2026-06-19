'use client';

import { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';

function DashboardShell({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <Sidebar />

      <div
        className="flex min-h-screen flex-col"
        style={{
          paddingLeft: 'var(--content-offset, 0px)',
          transition: 'padding-left var(--transition-slow)',
        }}
      >
        {/* Set the CSS variable for content offset based on sidebar state */}
        <style>{`
          @media (min-width: 768px) {
            :root {
              --content-offset: ${isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)'};
            }
          }
          @media (max-width: 767px) {
            :root {
              --content-offset: 0px;
            }
          }
        `}</style>

        <Header />

        <main
          className="page-enter flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full" style={{ maxWidth: '1200px' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  );
}
