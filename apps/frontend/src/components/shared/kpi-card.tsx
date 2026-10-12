'use client';
import * as React from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconSquare, type IconTone } from './icon-square';

const gridCols = {
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-6',
} as const;

export function KpiGrid({ cols = 4, className, children }: { cols?: keyof typeof gridCols; className?: string; children: React.ReactNode }) {
  return <div className={cn('mb-[18px] grid gap-3', gridCols[cols], className)}>{children}</div>;
}

export interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { dir: 'up' | 'down'; text: string };
  icon?: LucideIcon;
  tone?: IconTone;
  muted?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function KpiCard({ label, value, hint, delta, icon, tone = 'brand', muted, onClick, className, children, 'data-testid': testId }: KpiCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'relative rounded-lg border bg-card px-[18px] py-4 text-left motion-safe:transition-shadow hover:shadow-soft-md',
        onClick && 'cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {icon && <IconSquare icon={icon} tone={tone} size="md" />}
      </div>
      <div className={cn('tabular my-0.5 font-display text-xl font-bold leading-tight tracking-[-0.02em]', muted ? 'text-faint' : 'text-foreground')}>
        {value}
      </div>
      {(hint || delta) && (
        <div className="text-[11.5px] font-medium text-faint">
          {delta && (
            <span className={cn('mr-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-bold', delta.dir === 'up' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
              {delta.dir === 'up' ? <ArrowUp className="h-2.5 w-2.5" aria-hidden="true" /> : <ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />}
              {delta.text}
            </span>
          )}
          {hint}
        </div>
      )}
      {children}
    </Comp>
  );
}

export function MiniKpi({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border bg-surface-3 px-3.5 py-3', className)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="tabular my-0.5 font-display text-[17px] font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
