import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconSquare, type IconTone } from '@/components/shared/icon-square';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> { interactive?: boolean }

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-card text-card-foreground',
        interactive && 'motion-safe:transition-shadow hover:shadow-soft-md',
        className,
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 px-[18px] py-3.5', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display text-sm font-bold leading-snug tracking-[-0.01em]', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs font-medium text-faint', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-[18px] pb-4 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center px-[18px] pb-4 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export interface CardHeadProps {
  icon?: LucideIcon;
  tone?: IconTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

// The mockup's `.card-head`: icon square + display title + faint subtitle, actions on the right,
// a border underneath. Pair it with a CardContent that sets its own top padding (`pt-4`).
function CardHead({ icon, tone = 'brand', title, subtitle, actions, className }: CardHeadProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-[18px] py-3.5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconSquare icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-bold tracking-[-0.01em]">{title}</h2>
          {subtitle && <div className="text-xs font-medium text-faint">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardHead };
