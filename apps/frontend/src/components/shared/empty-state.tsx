import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, message, action, className }: {
  icon?: LucideIcon; title: React.ReactNode; message?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-dashed border-border-strong bg-card px-6 py-14 text-center text-muted-foreground', className)}>
      <Icon className="mx-auto mb-2.5 h-11 w-11 opacity-40" aria-hidden="true" />
      <div className="text-sm font-semibold">{title}</div>
      {message && <div className="mt-1 text-[12.5px] text-faint">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
