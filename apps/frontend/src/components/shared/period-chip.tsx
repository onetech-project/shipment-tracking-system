import * as React from 'react';
import { cn } from '@/lib/utils';

export function PeriodChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-sm border border-brand-line bg-brand-soft px-3 py-1.5 font-display text-[13px] font-semibold text-brand-ink', className)}>
      <span className="h-[7px] w-[7px] rounded-full bg-brand-2" aria-hidden="true" />
      {children}
    </span>
  );
}
