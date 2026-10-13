import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconSquare } from '@/components/shared/icon-square'

export interface ActionCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  className?: string
  'data-testid'?: string
  disabled?: boolean
}

export function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  className,
  'data-testid': testId,
  disabled,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        'group block rounded-lg border bg-card p-[18px]',
        'motion-safe:transition-all motion-safe:duration-150',
        'motion-safe:hover:shadow-soft-md motion-safe:hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <IconSquare icon={Icon} size="md" className="mb-3" />
      <h3 className="font-display text-sm font-bold text-card-foreground">{title}</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{description}</p>
    </Link>
  )
}
