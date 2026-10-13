'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { isStaging } from '@/lib/env'

const TABS = [
  { href: '/sla/air', label: 'Air' },
  { href: '/sla/sea', label: 'Sea' },
]

export default function SlaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.sla')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.sla')) return null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="SLA Monitoring"
        subtitle="Monitor alert pengiriman real-time: reservations, tracking, SLA & TJPH breach, serta OTP."
        badge={isStaging() ? <StagingBadge /> : undefined}
      />
      {/* Route-based Air/Sea switch — styled like the mockup's mode-tabs, kept as <Link>s
          (not ModeTabs) since it navigates between pages rather than toggling local state. */}
      <nav className="inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1" aria-label="SLA mode">
        {TABS.map(({ href, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'inline-flex items-center rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
                isActive
                  ? 'bg-card font-semibold text-foreground shadow-soft-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
