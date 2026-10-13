'use client'

import { useState, useEffect } from 'react'

interface SyncStatusBadgeProps {
  isConnected: boolean
  lastSyncAt: string | null
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Never'
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

export function SyncStatusBadge({ isConnected, lastSyncAt }: SyncStatusBadgeProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${
          isConnected
            ? 'border-brand-line bg-brand-soft text-brand-ink'
            : 'border-border bg-surface-2 text-muted-foreground'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-brand-2 motion-safe:animate-pulse-soft' : 'bg-faint'}`}
        />
        {isConnected ? 'Live' : 'Offline'}
      </span>
      {lastSyncAt && (
        <span className="text-muted-foreground">Last sync: {formatRelativeTime(lastSyncAt)}</span>
      )}
    </div>
  )
}
