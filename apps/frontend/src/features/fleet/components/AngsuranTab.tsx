'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
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
    return <EmptyState title="Belum ada data." />
  }

  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((label, i) => (
              <TableHead key={label} num={i >= 4}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => {
            const lease = v.lease
            const tenor = lease?.tenorBulan ?? 0
            const pct = tenor > 0 ? Math.round(((lease?.angsuranTerbayar ?? 0) / tenor) * 100) : 0
            const lunas = tenor > 0 && lease?.sisaAngsuran === 0

            return (
              <TableRow key={v.id}>
                <TableCell className="font-display font-extrabold tabular">{v.nopol}</TableCell>
                <TableCell>
                  {[v.merk, v.tipe].filter(Boolean).join(' ') || '—'}
                  <div className="text-xs text-muted-foreground">{v.jenisArmada?.label ?? ''}</div>
                </TableCell>
                <TableCell>
                  {v.kepemilikan?.label ?? '—'}
                  {v.pemilikUnit && (
                    <div className="text-xs text-muted-foreground">{v.pemilikUnit}</div>
                  )}
                </TableCell>
                <TableCell>
                  {lease?.leasing?.label ?? '—'}
                  {lease?.nomorKontrak && (
                    <div className="text-xs text-muted-foreground">{lease.nomorKontrak}</div>
                  )}
                </TableCell>
                <TableCell num>{lease ? formatRupiah(lease.cicilanPerBulan) : '—'}</TableCell>
                <TableCell num>{tenor ? `${tenor} bln` : '—'}</TableCell>
                <TableCell num>
                  {tenor ? `${lease?.angsuranTerbayar ?? 0} bln (${pct}%)` : '—'}
                </TableCell>
                <TableCell num>
                  {!tenor ? (
                    '—'
                  ) : lunas ? (
                    <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
                      lunas
                    </span>
                  ) : (
                    `${lease?.sisaAngsuran ?? 0} bln`
                  )}
                </TableCell>
                <TableCell num>
                  {lease && lease.sisaAngsuran > 0 ? formatRupiah(lease.sisaKewajiban) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <tfoot aria-label="Total kewajiban berjalan" className="border-t bg-table-head font-bold">
          <tr>
            <td className="px-2.5 py-2.5 text-xs" colSpan={4}>
              Total kewajiban berjalan
            </td>
            <td className="tabular px-2.5 py-2.5 text-right text-xs">{formatRupiah(totalCicilan)}</td>
            <td colSpan={3} />
            <td className="tabular px-2.5 py-2.5 text-right text-xs">{formatRupiah(totalSisa)}</td>
          </tr>
        </tfoot>
      </Table>
    </TableWrap>
  )
}
