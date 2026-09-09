'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/shared/hooks/use-permissions'

// The sidebar's NavLink is flat, so the module's sections live here as a sub-nav — the same shape
// air-shipments uses. Static rather than fetched: unlike air-shipments' sheet tabs, these three
// are known at build time.
//
// The Armada tab lands in Phase 2; Phase 1 ships the two sections that exist.
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasPermission } = usePermissions()

  const tabs = [
    { href: '/fleet/drivers', label: 'Sopir', show: true },
    {
      href: '/fleet/master-data',
      label: 'Master Data',
      show: hasPermission('read.fleet_master_data'),
    },
  ].filter((t) => t.show)

  return (
    <div>
      <nav className="mb-6 flex gap-1 border-b" aria-label="Bagian registrasi armada">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium motion-safe:transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
