'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { GoogleSheetConfig } from '../../../features/air-shipments/types'
import Spinner from '@/components/ui/spinner'

// Module-level flag to avoid duplicate fetches in development (React Strict Mode)
let _airShipmentsSublinksFetched = false

export default function AirShipmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sublinks, setSublinks] = useState([
    { href: '/air-shipments/google-sheet-config', label: 'Google Sheet Config' },
  ] as { href: string; label: string }[])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        res.data.forEach((config: GoogleSheetConfig) => {
          config.sheetConfigs?.forEach((sheetConfig) => {
            const label =
              sheetConfig.sheetName.match(/[A-Z]+(?=[A-Z][a-z]|$)/g)?.join(' ') ||
              sheetConfig.sheetName
            const href = `/air-shipments/${sheetConfig.tableName}`
            setSublinks((prev) => [
              {
                label,
                href,
              },
              ...prev,
            ])
          })
          _airShipmentsSublinksFetched = false
        })
      })
      .catch((err: Error) => setError(err.message || 'Failed to load sublinks'))
      .finally(() => setIsLoading(false))
  }, [])

  // centered spinner while loading
  if (isLoading)
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="h-12 w-12" ariaLabel="Loading Air Shipments sublinks" />
      </div>
    )
  if (error) return <div className="text-red-500">Error: {error}</div>
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Air Shipments</h1>
        <nav className="mt-3 flex gap-1 border-b">
          {sublinks.map(({ href, label }) => {
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
      </div>
      {children}
    </div>
  )
}
