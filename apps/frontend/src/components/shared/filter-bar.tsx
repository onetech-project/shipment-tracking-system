import * as React from 'react';
import { cn } from '@/lib/utils';

// `.filter-row` in the mockup: a white bordered strip that lines fields up on their bottom edge.
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3.5 flex flex-wrap items-end gap-3 rounded-lg border bg-card px-4 py-3.5', className)}>
      {children}
    </div>
  );
}
