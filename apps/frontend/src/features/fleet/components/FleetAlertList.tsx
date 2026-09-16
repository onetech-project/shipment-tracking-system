'use client'

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
    <section className="mb-6 rounded-lg border bg-card">
      <header className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Perlu tindakan</h2>
        <span className="text-xs text-muted-foreground">
          {isLoading || isError
            ? ''
            : alerts.length > 0
              ? `${alerts.length} dokumen perlu diperpanjang`
              : 'ambang sesuai jenis dokumen'}
        </span>
      </header>

      {isLoading ? (
        <div data-testid="alert-skeleton" className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        // Never the empty state during an outage: "nothing is due" is an affirmative claim, and
        // an operator who believes it stops checking.
        <p className="p-4 text-sm text-muted-foreground">Gagal memuat daftar jatuh tempo.</p>
      ) : alerts.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Tidak ada dokumen yang jatuh tempo dalam ambang peringatan.
        </p>
      ) : (
        <ul className="divide-y">
          {alerts.map((alert) => {
            const tone =
              alert.severity === 'crit'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            const subtitle = [
              [alert.merk, alert.tipe].filter(Boolean).join(' '),
              alert.pool,
              alert.kind === 'sim' ? alert.driverName : null,
            ]
              .filter(Boolean)
              .join(' · ')

            const title = (
              <span className="font-medium tabular-nums">{alert.nopol ?? alert.driverName ?? '—'}</span>
            )

            return (
              <li
                key={`${alert.kind}-${alert.subjectId}-${alert.vehicleId ?? 'none'}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    alert.severity === 'crit' ? 'bg-destructive' : 'bg-amber-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  {/* A licence with no vehicle has nothing to open, so it is not made to look
                      clickable. */}
                  {alert.vehicleId ? (
                    <button
                      onClick={() => onOpen(alert.vehicleId as string)}
                      className="text-left hover:underline"
                    >
                      {title}
                      <span className="text-muted-foreground"> · {alert.label}</span>
                    </button>
                  ) : (
                    <span>
                      {title}
                      <span className="text-muted-foreground"> · {alert.label}</span>
                    </span>
                  )}
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                </div>
                <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                  {formatTanggal(alert.expiresAt)}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
                  {sisaText(alert.daysLeft)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
