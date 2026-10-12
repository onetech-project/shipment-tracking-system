import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'warn' | 'danger' | 'info' | 'success';

const toneClass: Record<Tone, { box: string; ic: string; Icon: LucideIcon }> = {
  warn: { box: 'border-warn/25 bg-warn-soft text-warn-ink', ic: 'bg-warn', Icon: AlertTriangle },
  danger: { box: 'border-bad/25 bg-bad-soft text-bad-ink', ic: 'bg-bad', Icon: XCircle },
  info: { box: 'border-info/20 bg-[#ecfeff] text-info-ink', ic: 'bg-info', Icon: Info },
  success: { box: 'border-brand-line bg-brand-soft text-brand-ink', ic: 'bg-brand-2', Icon: CheckCircle2 },
};

export function Banner({ tone, title, icon, children, className, role }: {
  tone: Tone; title?: React.ReactNode; icon?: LucideIcon; children?: React.ReactNode; className?: string; role?: string;
}) {
  const t = toneClass[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={cn('mb-3 flex items-start gap-2.5 rounded-sm border px-3.5 py-2.5 text-[12.5px]', t.box, className)}>
      <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-white', t.ic)}>
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
