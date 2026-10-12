import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IconTone = 'brand' | 'alt' | 'light' | 'dark' | 'info' | 'warn' | 'danger' | 'muted';

export const iconToneClass: Record<IconTone, string> = {
  brand: 'bg-brand-2 text-white',
  alt: 'bg-brand text-white',
  light: 'bg-brand-light text-brand-ink',
  dark: 'bg-ink-2 text-brand-light',
  info: 'bg-info text-white',
  warn: 'bg-warn text-white',
  danger: 'bg-bad-strong text-white',
  muted: 'bg-muted-foreground text-white',
};

export function IconSquare({ icon: Icon, tone = 'brand', size = 'sm', className }: {
  icon: LucideIcon; tone?: IconTone; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <span
      data-testid="icon-square"
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'sm' ? 'h-7 w-7 rounded-[7px]' : 'h-8 w-8 rounded-sm',
        iconToneClass[tone],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
