'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { GoogleSheetConfig } from '../../../features/air-shipments/types'
import Spinner from '@/components/ui/spinner'
import { useRouter } from 'next/navigation'
import { getAirShipmentsTabName } from '../../../features/air-shipments/utils/normalizeTableName'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { Banner } from '@/components/shared/banner'
import { isStaging } from '@/lib/env'

// Module-level flag to avoid duplicate fetches in development (React Strict Mode)
let _airShipmentsSublinksFetched = false

export default function AirShipmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sublinks, setSublinks] = useState([
    { href: '/air-shipments/google-sheet-config', label: 'Google Sheet Config' },
  ] as { href: string; label: string }[])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (_airShipmentsSublinksFetched) {
      setIsLoading(false)
      return
    }
    _airShipmentsSublinksFetched = true

    apiClient
      .get('/air-shipments/google-sheet-config')
      .then((res) => {
        // get google sheet sheet config and add to sublinks
        const sheetLinks = res.data.map((config: GoogleSheetConfig) => {
          const links = config.sheetConfigs?.map((sheetConfig) => {
            const label = getAirShipmentsTabName(sheetConfig.sheetName) || sheetConfig.sheetName
            const href = `/air-shipments/${sheetConfig.tableName}`
            return { sheetName: sheetConfig.sheetName, label, href }
          })
          return links || []
        })
        // Dedupe tabs by sheet name so identical sheet names render a single tab
        const seenSheetNames = new Set<string>()
        const flattenedLinks = sheetLinks
          .flat()
          .filter(({ sheetName }: { sheetName: string }) => {
            if (seenSheetNames.has(sheetName)) return false
            seenSheetNames.add(sheetName)
            return true
          })
          .map(({ label, href }: { label: string; href: string }) => ({ label, href }))
        setSublinks((prev) => [...flattenedLinks, ...prev])
        if (pathname === '/air-shipments' || pathname === '/air-shipments/') {
          router.push(flattenedLinks[0]?.href || '/air-shipments/google-sheet-config') // Redirect to first sublink or default config page
        }
      })
      .catch((err: Error) => setError(err.message || 'Failed to load sublinks'))
      .finally(() => {
        setIsLoading(false)
        _airShipmentsSublinksFetched = false // Redirect to default sub-page after loading sublinks
      })
  }, [router])

  // centered spinner while loading
  if (isLoading)
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="h-12 w-12" ariaLabel="Loading Air Shipments sublinks" />
      </div>
    )
  if (error) return <Banner tone="danger">Error: {error}</Banner>
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Air Shipments"
        subtitle="Monitor data pengiriman per-TO dari semua sumber sheet. Pilih tab untuk melihat dataset tertentu."
        badge={isStaging() ? <StagingBadge /> : undefined}
      />
      {/* Route-based navigation between sheet sources — styled like the mockup's mode-tabs,
          but kept as <Link>s (not ModeTabs) since it navigates rather than toggling local state. */}
      <nav className="inline-flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-1" aria-label="Sheet sources">
        {sublinks.map(({ href, label }) => {
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
