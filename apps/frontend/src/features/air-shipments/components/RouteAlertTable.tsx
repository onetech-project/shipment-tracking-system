'use client'

export interface RouteAlertRow {
  route: string
  totalTonnage: number
  totalCount: number
  alerts: {
    reservasiPenerbangan: number
    potensiMelebihiSla: number
    melewatiSla: number
    potensiMelebihiTjph: number
    melewatiTjph: number
  }
  alertCounts: {
    reservasiPenerbangan: number
    potensiMelebihiSla: number
    melewatiSla: number
    potensiMelebihiTjph: number
    melewatiTjph: number
  }
  otp: {
    percentage: number | null
    onTimeWeight: number
    onTimeCount: number
    lateWeight: number
    lateCount: number
  }
}

interface RouteAlertTableProps {
  data: RouteAlertRow[]
  isLoading: boolean
  onAlertClick: (route: string, alertKey: keyof RouteAlertRow['alerts']) => void
}

const ALERT_COLS: Array<{ key: keyof RouteAlertRow['alerts']; label: string; color: string }> = [
  { key: 'reservasiPenerbangan', label: 'Flight Res.', color: '#F97316' },
  { key: 'potensiMelebihiSla', label: 'Pot. SLA', color: '#EAB308' },
  { key: 'melewatiSla', label: 'SLA Breach', color: '#EF4444' },
  { key: 'potensiMelebihiTjph', label: 'Pot. TJPH', color: '#8B5CF6' },
  { key: 'melewatiTjph', label: 'TJPH Breach', color: '#DC2626' },
]

function fmt(n: number) {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function otpColor(pct: number) {
  if (pct >= 80) return '#22C55E'
  if (pct >= 50) return '#EAB308'
  return '#EF4444'
}

export function RouteAlertTable({ data, isLoading, onAlertClick }: RouteAlertTableProps) {
  return (
    <div className="rounded-3xl border border-border bg-panel p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-foreground">Alerts by Route</h3>
      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading route data…</p>
      ) : data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No route data for this period.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-background">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-30 bg-background py-2 pr-4 text-left font-medium text-foreground [box-shadow:1px_0_0_0_hsl(var(--border))]">Route</th>
                <th className="py-2 pr-4 text-right font-medium text-foreground">
                  <span className="text-xs text-muted-foreground">(TOs)</span> Total{' '}
                  <span className="text-xs text-muted-foreground">(Kg)</span>
                </th>
                {ALERT_COLS.map((col) => (
                  <th key={col.key} className="py-2 pr-4 text-right font-medium" style={{ color: col.color }}>
                    <span className="text-xs opacity-60">(TOs)</span> {col.label}{' '}
                    <span className="text-xs opacity-60">(Kg)</span>
                  </th>
                ))}
                <th className="py-2 pr-4 text-right font-medium text-muted-foreground">OTP %</th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: '#22C55E' }}>
                  <span className="text-xs opacity-60">(TOs)</span> On Time{' '}
                  <span className="text-xs opacity-60">(Kg)</span>
                </th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: '#EF4444' }}>
                  <span className="text-xs opacity-60">(TOs)</span> Late{' '}
                  <span className="text-xs opacity-60">(Kg)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                const { percentage, onTimeWeight, onTimeCount, lateWeight, lateCount } = row.otp
                const hasOtp = onTimeWeight > 0 || lateWeight > 0
                return (
                  <tr
                    key={row.route}
                    className={`border-b border-border/50 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                  >
                    <td className={`sticky left-0 z-10 [box-shadow:1px_0_0_0_hsl(var(--border))] py-2 pr-4 font-medium text-foreground ${idx % 2 === 1 ? 'bg-muted' : 'bg-background'}`}>{row.route}</td>
                    <td className="py-2 pr-4 text-right text-foreground">
                      <span className="text-muted-foreground">({row.totalCount})</span>{' '}
                      {fmt(row.totalTonnage)}
                    </td>
                    {ALERT_COLS.map((col) => {
                      const tonnage = row.alerts[col.key]
                      const count = row.alertCounts[col.key]
                      const hasAlert = tonnage > 0
                      return (
                        <td key={col.key} className="py-2 pr-4 text-right">
                          {hasAlert ? (
                            <button
                              type="button"
                              onClick={() => onAlertClick(row.route, col.key)}
                              className="rounded px-1.5 py-0.5 transition hover:opacity-75 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1"
                              style={{ color: col.color }}
                              title={`Filter by ${col.label} · ${row.route}`}
                            >
                              <span className="font-normal opacity-70">({count})</span>{' '}
                              <span className="font-medium">{fmt(tonnage)}</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-2 pr-4 text-right">
                      {percentage !== null ? (
                        <span className="font-medium" style={{ color: otpColor(percentage) }}>
                          {percentage}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {hasOtp ? (
                        <>
                          <span className="text-muted-foreground">({onTimeCount})</span>{' '}
                          <span className="font-medium" style={{ color: '#22C55E' }}>{fmt(onTimeWeight)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {hasOtp ? (
                        <>
                          <span className="text-muted-foreground">({lateCount})</span>{' '}
                          <span className="font-medium" style={{ color: '#EF4444' }}>{fmt(lateWeight)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
