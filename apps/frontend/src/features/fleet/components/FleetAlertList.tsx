'use client'

import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { Banner } from '@/components/shared/banner'
import { EmptyState } from '@/components/shared/empty-state'
import { FleetAlert } from '../types'
import { formatTanggal } from '../utils/format-date'

interface Props {
  alerts: FleetAlert[]
  isLoading: boolean
  isError: boolean
  onOpen: (vehicleId: string) => void
}

// Built from the server's daysLeft, never from the date: the browser clock is the user's, and the
// whole module keeps date arithmetic on one side of the wire.
function sisaText(daysLeft: number): string {
  if (daysLeft < 0) return `lewat ${Math.abs(daysLeft)} hari`
  if (daysLeft === 0) return 'hari ini'
  return `${daysLeft} hari lagi`
}

export function FleetAlertList({ alerts, isLoading, isError, onOpen }: Props) {
  return (
    <Card className="mb-6">
      <CardHead
        icon={AlertTriangle}
        tone="danger"
        title="Perlu tindakan"
        subtitle={
          isLoading || isError
            ? ''
            : alerts.length > 0
              ? `${alerts.length} dokumen perlu diperpanjang`
              : 'ambang sesuai jenis dokumen'
        }
      />
      <CardContent className="pt-4">
        {isLoading ? (
          <div data-testid="alert-skeleton" className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          // Never the empty state during an outage: "nothing is due" is an affirmative claim, and
          // an operator who believes it stops checking.
          <Banner tone="danger">Gagal memuat daftar jatuh tempo.</Banner>
        ) : alerts.length === 0 ? (
          <EmptyState title="Tidak ada dokumen yang jatuh tempo dalam ambang peringatan." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {alerts.map((alert) => {
              const overdue = alert.severity === 'crit'
              const subtitle = [
                [alert.merk, alert.tipe].filter(Boolean).join(' '),
                alert.pool,
                alert.kind === 'sim' ? alert.driverName : null,
              ]
                .filter(Boolean)
                .join(' · ')

              const title = (
                <span className="font-display font-extrabold tabular">
                  {alert.nopol ?? alert.driverName ?? '—'}
                </span>
              )

              return (
                <li
                  key={`${alert.kind}-${alert.subjectId}-${alert.vehicleId ?? 'none'}`}
                  // The row tints, not just the chip: `#fef5f5`/`#fdecec` (overdue) and
                  // `#fffbe8`/`#fef5d1` (soon) are the mockup's exact `.action-item` wash —
                  // paler than any `bg-bad-soft`/`bg-warn-soft` shade, intentionally kept as
                  // literal hex per the task brief rather than approximated with a token.
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sm border-l-[3px] px-3 py-2.5 motion-safe:transition-colors ${
                    overdue
                      ? 'border-l-bad bg-[#fef5f5] hover:bg-[#fdecec]'
                      : 'border-l-warn bg-[#fffbe8] hover:bg-[#fef5d1]'
                  }`}
                >
                  <span
                    className={`grid h-8 min-w-11 shrink-0 place-items-center rounded-sm border px-1.5 font-display text-[10.5px] font-extrabold tracking-[0.04em] ${
                      overdue
                        ? 'border-bad/25 bg-bad-soft text-bad-ink'
                        : 'border-warn/30 bg-warn-soft text-warn-ink'
                    }`}
                  >
                    {alert.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* A licence with no vehicle has nothing to open, so it is not made to look
                        clickable. */}
                    {alert.vehicleId ? (
                      <button
                        onClick={() => onOpen(alert.vehicleId as string)}
                        className="text-left text-[12.5px] font-semibold hover:underline"
                      >
                        {title}
                        <span className="font-normal text-muted-foreground"> · {alert.label}</span>
                      </button>
                    ) : (
                      <span className="text-[12.5px] font-semibold">
                        {title}
                        <span className="font-normal text-muted-foreground"> · {alert.label}</span>
                      </span>
                    )}
                    <div className="truncate text-[11.5px] text-muted-foreground">{subtitle}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="hidden text-[11.5px] font-semibold tabular text-foreground sm:block">
                      {formatTanggal(alert.expiresAt)}
                    </div>
                    <div className={`text-[11px] font-bold ${overdue ? 'text-bad' : 'text-warn'}`}>
                      {sisaText(alert.daysLeft)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
