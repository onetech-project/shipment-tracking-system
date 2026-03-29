'use client';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopBarProps { onMenuToggle: () => void; }

export function TopBar({ onMenuToggle }: TopBarProps) {
  return (
    <header className="flex h-14 items-center border-b bg-background px-4">
      <Button variant="ghost" size="icon" aria-label="Open menu" onClick={onMenuToggle} className="mr-3">
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold">Shipment Tracker</span>
    </header>
  );
}
