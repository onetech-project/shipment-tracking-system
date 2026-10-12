import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  /** The heading level to render. Defaults to 'h1'; pass 'h2' when this header is nested under
   *  the layout's own page h1, so the document never carries two h1s. */
  as?: 'h1' | 'h2';
}

export function PageHeader({ title, subtitle, action, badge, className, as: Heading = 'h1' }: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <Heading className="mb-1 flex flex-wrap items-center gap-2.5 font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
          {title}
          {badge}
        </Heading>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2.5">{action}</div>}
    </div>
  );
}
