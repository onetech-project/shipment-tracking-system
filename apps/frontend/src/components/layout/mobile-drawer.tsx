'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

interface MobileDrawerProps { open: boolean; onClose: () => void; }

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-60 p-0 bg-sidebar border-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <Sidebar onNavClick={onClose} />
      </SheetContent>
    </Sheet>
  );
}
