import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusVariant = 'active' | 'inactive' | 'locked' | 'pending' | 'success' | 'error';

const variantMap: Record<StatusVariant, NonNullable<BadgeProps['variant']>> = {
  active: 'active',
  inactive: 'inactive',
  locked: 'danger',
  pending: 'pending',
  success: 'active',
  error: 'danger',
};

export interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  return <Badge variant={variantMap[variant]} className={cn(className)}>{displayLabel}</Badge>;
}
