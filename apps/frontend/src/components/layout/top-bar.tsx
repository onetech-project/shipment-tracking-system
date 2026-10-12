'use client';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/shared/brand-logo';

interface TopBarProps { onMenuToggle: () => void; }

export function TopBar({ onMenuToggle }: TopBarProps) {
  return (
    <header className="flex h-14 w-full items-center gap-3 border-b bg-card px-4">
      <Button variant="ghost" size="icon" aria-label="Open menu" onClick={onMenuToggle} className="mr-3">
        <Menu className="h-5 w-5" />
      </Button>
      <BrandLogo size="sm" />
      <span className="font-display text-sm font-bold">Shipment Tracker</span>
    </header>
  );
}
