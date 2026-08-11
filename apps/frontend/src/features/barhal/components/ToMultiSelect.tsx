'use client'

import { AvailableTo } from '../types'
import { formatDate } from '../utils/dateFormat'

interface ToMultiSelectProps {
  options: AvailableTo[]
  selected: string[]
  onChange: (toNumbers: string[]) => void
  isLoading?: boolean
  /** TO yang tersaring karena rutenya belum terdaftar di master air_shipments_data. */
  unmatchedRouteCount?: number
  /**
   * Apakah pencarian di atas sedang terisi. Hanya dipakai untuk menyembunyikan petunjuk "ketik
   * untuk mencari" — petunjuk itu tidak ada gunanya kalau operator sudah mengetik sesuatu.
   */
  hasSearch?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const AVAILABLE_TOS_LIMIT = 100

/**
 * Daftar TO ini sengaja tidak punya kolom pencarian sendiri. Pencariannya ada satu, di panel filter
 * Step 2, dan dijalankan di server — daftar ini hanya memuat AVAILABLE_TOS_LIMIT baris, sehingga
 * penyaringan di sisi klien tidak akan pernah menemukan TO yang sudah terpotong oleh limit itu.
 */
export function ToMultiSelect({ options, selected, onChange, isLoading, unmatchedRouteCount, hasSearch }: ToMultiSelectProps) {
  const selectedSet = new Set(selected)

  const toggle = (toNumber: string) => {
    onChange(selectedSet.has(toNumber) ? selected.filter((t) => t !== toNumber) : [...selected, toNumber])
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="max-h-64 overflow-auto">
        {isLoading ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : options.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Tidak ada TO tersedia.</p>
        ) : (
          options.map((to) => (
            <label
              key={to.to_number}
              className="flex cursor-pointer flex-col gap-1 border-b border-border/50 px-3 py-2 text-xs last:border-b-0 hover:bg-accent/30"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(to.to_number)}
                    onChange={() => toggle(to.to_number)}
                    className="h-3 w-3 rounded border border-border accent-accent"
                  />
                  <span className="truncate font-medium">{to.to_number}</span>
                  <span className="truncate text-muted-foreground">{to.awb ?? '—'}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDate(to.date)}</span>
                  <span className="shrink-0 text-muted-foreground">{to.vendor}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {fmt.format(to.gross_weight ?? 0)} kg
                </span>
              </span>
              <span className="ml-5 flex items-center gap-2 truncate text-muted-foreground">
                <span className="truncate">{to.lt_number ?? '—'}</span>
                <span className="truncate">{to.origin_station ?? '—'} → {to.dest_station ?? '—'}</span>
                <span className="truncate">Remarks: {to.remarks ?? '—'}</span>
              </span>
            </label>
          ))
        )}
      </div>
      {!isLoading && !hasSearch && options.length >= AVAILABLE_TOS_LIMIT && (
        <p className="border-t border-border px-3 py-2 text-center text-xs text-muted-foreground">
          Tidak menemukan data? Ketik No. TO / LT / AWB di kolom pencarian di atas.
        </p>
      )}
      {!isLoading && !!unmatchedRouteCount && (
        <div className="border-t border-border px-3 py-2 text-center text-xs space-y-1">
          <p className="text-amber-600">
            {unmatchedRouteCount} TO disembunyikan — rutenya belum terdaftar di master air_shipments_data.
          </p>
          <p className="text-muted-foreground">
            Jumlah ini mencakup semua rute dan tidak mengikuti filter Origin/Destinasi.
          </p>
        </div>
      )}
    </div>
  )
}
