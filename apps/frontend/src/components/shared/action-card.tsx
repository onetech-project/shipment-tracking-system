import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        'group block rounded-lg border bg-card p-6 shadow-sm',
        'motion-safe:transition-all motion-safe:duration-150',
        'motion-safe:hover:shadow-md motion-safe:hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-card-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  )
}
