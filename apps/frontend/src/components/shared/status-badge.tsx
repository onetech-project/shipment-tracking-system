import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusVariant = 'active' | 'inactive' | 'locked' | 'pending' | 'success' | 'error';

const variantClasses: Record<StatusVariant, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  locked: 'bg-red-100 text-red-700 border-red-200',
  pending: 'bg-blue-100 text-blue-700 border-blue-200',
  success: 'bg-green-100 text-green-800 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200',
};

export interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  return (
    <Badge variant="outline" className={cn(variantClasses[variant], className)}>
      {displayLabel}
    </Badge>
  );
}
