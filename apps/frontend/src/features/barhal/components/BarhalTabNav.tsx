'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'koli', label: 'Koli', href: '/barhal/koli' },
  { key: 'smu', label: 'SMU', href: '/barhal/smu' },
  { key: 'dashboard', label: 'Dashboard', href: '/barhal/dashboard' },
] as const

interface BarhalTabNavProps {
  active: 'koli' | 'smu' | 'dashboard'
}

export function BarhalTabNav({ active }: BarhalTabNavProps) {
  return (
    // Styled like the mockup's mode-tabs, but kept as <Link>s (not ModeTabs) since it navigates
    // between routes rather than toggling local state — same reasoning as the Air Shipments layout.
    <nav className="inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1" aria-label="Barhal views">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            'inline-flex items-center rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
            active === tab.key
              ? 'bg-card font-semibold text-foreground shadow-soft-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
