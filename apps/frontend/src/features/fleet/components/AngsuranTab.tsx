'use client'

import { FleetVehicle } from '../types'
import { formatRupiah } from '../utils/format-rupiah'

interface Props {
  vehicles: FleetVehicle[]
}

const COLUMNS = [
  'Nopol',
  'Kendaraan',
  'Kepemilikan',
  'Leasing',
  'Cicilan/bulan',
  'Tenor',
  'Terbayar',
  'Sisa',
  'Sisa kewajiban',
]

// A table of what the company still owes. Every figure comes from the backend already settled —
// this component formats and totals, and computes no instalment of its own.
export function AngsuranTab({ vehicles }: Props) {
  // Heaviest obligation first: the operator opens this tab to see what is owed, not to read an
  // alphabetical list.
  const rows = [...vehicles].sort(
    (a, b) => (b.lease?.sisaKewajiban ?? 0) - (a.lease?.sisaKewajiban ?? 0) || a.nopol.localeCompare(b.nopol),
  )

  let totalCicilan = 0
  let totalSisa = 0
  for (const v of rows) {
    // A settled contract is history, not an obligation — the same rule the summary tiles apply.
    if (v.lease && v.lease.sisaAngsuran > 0) {
      totalCicilan += v.lease.cicilanPerBulan ?? 0
      totalSisa += v.lease.sisaKewajiban
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Belum ada data.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            {COLUMNS.map((label, i) => (
              <th key={label} className={`px-3 py-2 font-medium ${i >= 4 ? 'text-right' : 'text-left'}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const lease = v.lease
            const tenor = lease?.tenorBulan ?? 0
            const pct = tenor > 0 ? Math.round(((lease?.angsuranTerbayar ?? 0) / tenor) * 100) : 0
            const lunas = tenor > 0 && lease?.sisaAngsuran === 0

            return (
              <tr key={v.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium tabular-nums">{v.nopol}</td>
                <td className="px-3 py-2">
                  {[v.merk, v.tipe].filter(Boolean).join(' ') || '—'}
                  <div className="text-xs text-muted-foreground">{v.jenisArmada?.label ?? ''}</div>
                </td>
                <td className="px-3 py-2">
                  {v.kepemilikan?.label ?? '—'}
                  {v.pemilikUnit && (
                    <div className="text-xs text-muted-foreground">{v.pemilikUnit}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {lease?.leasing?.label ?? '—'}
                  {lease?.nomorKontrak && (
                    <div className="text-xs text-muted-foreground">{lease.nomorKontrak}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {lease ? formatRupiah(lease.cicilanPerBulan) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{tenor ? `${tenor} bln` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {tenor ? `${lease?.angsuranTerbayar ?? 0} bln (${pct}%)` : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {!tenor ? (
                    '—'
                  ) : lunas ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      lunas
                    </span>
                  ) : (
                    `${lease?.sisaAngsuran ?? 0} bln`
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {lease && lease.sisaAngsuran > 0 ? formatRupiah(lease.sisaKewajiban) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot aria-label="Total kewajiban berjalan" className="border-t bg-muted/40 font-medium">
          <tr>
            <td className="px-3 py-2" colSpan={4}>
              Total kewajiban berjalan
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(totalCicilan)}</td>
            <td colSpan={3} />
            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(totalSisa)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
