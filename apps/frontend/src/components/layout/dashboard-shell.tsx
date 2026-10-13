'use client';
import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { MobileDrawer } from './mobile-drawer';

interface DashboardShellProps { children: React.ReactNode; }

export function DashboardShell({ children }: DashboardShellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setIsOpen((o) => !o);
  const close = () => setIsOpen(false);

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 1024) close(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className={`hidden lg:flex lg:flex-col lg:shrink-0 h-full transition-[width] duration-200 ${collapsed ? 'lg:w-14' : 'lg:w-[248px]'}`}>
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>
      <MobileDrawer open={isOpen} onClose={close} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex lg:hidden">
          <TopBar onMenuToggle={toggle} />
        </div>
        <main className="flex-1 overflow-auto px-4 py-4 lg:px-8 lg:pb-14 lg:pt-[26px]">
          <div className="mx-auto w-full max-w-[1700px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
