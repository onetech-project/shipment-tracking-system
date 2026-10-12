import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, badge, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="mb-1 flex flex-wrap items-center gap-2.5 font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
          {title}
          {badge}
        </h1>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2.5">{action}</div>}
    </div>
  );
}
