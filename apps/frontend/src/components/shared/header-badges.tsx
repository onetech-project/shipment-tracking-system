import * as React from 'react';
import { cn } from '@/lib/utils';

export function StagingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.08em] text-warn-ink',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
      Staging
    </span>
  );
}

export function LiveBadge({
  children = 'Live',
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink',
        className,
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-brand-2 motion-safe:animate-pulse-soft" aria-hidden="true" />
      {children}
    </span>
  );
}
