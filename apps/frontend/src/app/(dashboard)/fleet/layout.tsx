'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { Truck, IdCard, Database } from 'lucide-react'

// The sidebar's NavLink is flat, so the module's sections live here as a sub-nav — the same shape
// air-shipments and sla use (ModeTabs look, kept as <Link>s since it navigates rather than
// toggling local state). Static rather than fetched: unlike air-shipments' sheet tabs, these three
// are known at build time.
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasPermission } = usePermissions()

  // Armada leads: it is what the sidebar entry means and what an operator opens the module for.
  const tabs = [
    { href: '/fleet/vehicles', label: 'Armada', icon: Truck, show: hasPermission('read.fleet_vehicle') },
    { href: '/fleet/drivers', label: 'Sopir', icon: IdCard, show: true },
    {
      href: '/fleet/master-data',
      label: 'Master Data',
      icon: Database,
      show: hasPermission('read.fleet_master_data'),
    },
  ].filter((t) => t.show)

  return (
    <div>
      <nav
        className="mb-6 inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1"
        aria-label="Bagian registrasi armada"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + '/')
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
                active
                  ? 'bg-card font-semibold text-foreground shadow-soft-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
