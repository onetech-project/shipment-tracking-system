'use client';
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
  'data-testid'?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: SegmentedItem<T>[];
  className?: string;
  'aria-label'?: string;
}

function makeTabs(styles: { list: string; tab: string; active: string; idle: string }) {
  return function Tabs<T extends string>({ value, onValueChange, items, className, 'aria-label': ariaLabel }: SegmentedProps<T>) {
    return (
      <div role="tablist" aria-label={ariaLabel} className={cn(styles.list, className)}>
        {items.map((item) => {
          const active = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              data-testid={item['data-testid']}
              onClick={() => onValueChange(item.value)}
              className={cn(styles.tab, active ? styles.active : styles.idle, 'disabled:cursor-not-allowed disabled:opacity-50')}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {item.label}
              {item.count !== undefined && <span className="tabular text-[10.5px] opacity-70">{item.count}</span>}
            </button>
          );
        })}
      </div>
    );
  };
}

// `.mode-tabs` in the mockup: grey track, active tab lifts to white.
export const ModeTabs = makeTabs({
  list: 'inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1',
  tab: 'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
  active: 'bg-card font-semibold text-foreground shadow-soft-sm',
  idle: 'text-muted-foreground hover:text-foreground',
});

// `.sub-tabs` in the mockup: bordered chips, active chip filled with brand-ink.
export const SubTabs = makeTabs({
  list: 'flex flex-wrap gap-1',
  tab: 'inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-[11.5px] font-medium motion-safe:transition-all',
  active: 'border-brand-ink bg-brand-ink font-semibold text-white',
  idle: 'border-border bg-card text-muted-foreground hover:border-brand hover:text-brand-ink',
});
