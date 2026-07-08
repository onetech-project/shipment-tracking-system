'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'

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
    <div className="flex flex-col gap-6">
      <nav className="flex gap-1 border-b">
        {TABS.map(({ href, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
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
