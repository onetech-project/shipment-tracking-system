'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { MultiVendorFilter } from '@/components/shared/multi-vendor-filter'
import {
  useAvailableVendors,
  useVendorGroups,
} from '@/features/vendor-groups/hooks/useVendorGroups'
import {
  PnlFilter,
  PnlRouteFilter,
  PnlVendorPick,
  usePnlVendorComparison,
} from '../hooks/usePnl'
import { periodBounds } from '../utils/periodBounds'
import {
  overlappingVendors,
  routeFromVendorComparisonCell,
  toVendorComparisonTable,
} from '../utils/vendorComparison'
import { PnlComparisonTable } from './PnlComparisonTable'

// Mirrors MAX_VENDOR_COLUMNS in apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts. Enforced
// here too because the server answers an over-long request with a 400, which the error branch below
// would render as an unexplained "Failed to load the comparison." with a Retry button that fails
// identically forever, never telling the user they simply picked too many columns.
const MAX_VENDOR_COLUMNS = 12

interface PnlVendorComparisonViewProps {
  filter: PnlFilter
  // Pick order is column order, so the array is appended to rather than re-sorted. Owned by the
  // page so switching tabs — which unmounts this component outright — does not discard it.
  picks: PnlVendorPick[]
  onPicksChange: (next: PnlVendorPick[]) => void
  onCellClick?: (route: PnlRouteFilter) => void
}

export function PnlVendorComparisonView({
  filter,
  picks,
  onPicksChange,
  onCellClick,
}: PnlVendorComparisonViewProps) {
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useVendorGroups()
  const { data: availableVendors } = useAvailableVendors()
  const { data, isLoading, isError, refetch } = usePnlVendorComparison(filter, picks)

  const pickedVendors = picks.flatMap((p) => (p.kind === 'vendor' ? [p.name] : []))

  // Picks outlive this component, so a group deleted while the user was on another tab would
  // otherwise leave a checkbox pointing at nothing. The `!groups` guard is load-bearing:
  // useVendorGroups has no initialData and react-query's default 5-minute gcTime means an
  // undefined list is the normal state after a few minutes away — pruning then would wipe the
  // selection this whole feature exists to keep. Raw vendor picks are never pruned; a name can
  // vanish from the sheet at any time and an empty column is the honest answer.
  useEffect(() => {
    if (!groups) return
    const pruned = picks.filter((p) => p.kind !== 'group' || groups.some((g) => g.id === p.id))
    if (pruned.length !== picks.length) onPicksChange(pruned)
  }, [groups, picks, onPicksChange])

  const atLimit = picks.length >= MAX_VENDOR_COLUMNS

  const toggleGroup = (id: string) => {
    const isPicked = picks.some((p) => p.kind === 'group' && p.id === id)
    // Unchecking is always allowed; only adding is capped.
    if (!isPicked && atLimit) return
    onPicksChange(
      isPicked
        ? picks.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...picks, { kind: 'group', id }],
    )
  }

  // Vendors are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setVendorNames = (names: string[]) => {
    const kept = picks.filter((p) => p.kind === 'group' || names.includes(p.name))
    const added = names
      .filter((name) => !picks.some((p) => p.kind === 'vendor' && p.name === name))
      .map((name) => ({ kind: 'vendor' as const, name }))
    // The dropdown's "All" button hands over every vendor at once, so the cap is applied here too
    // rather than only on the group checkboxes.
    onPicksChange([...kept, ...added].slice(0, MAX_VENDOR_COLUMNS))
  }

  const overlaps = overlappingVendors(data?.columns ?? [])
  const bounds = periodBounds(filter)

  if (isLoadingGroups) {
    return <div className="h-24 animate-pulse rounded-lg border bg-card" />
  }

  // Distinct from the "nothing to pick" empty state below: GET /vendor-groups is guarded by
  // read.vendor_group, so a user without it gets a 403 here, not an empty list — and would
  // otherwise be told to go create a group on a page that bounces them straight back out.
  if (isGroupsError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load Vendor Groups.</p>
        <button onClick={() => refetchGroups()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>
    )
  }

  // A user with no saved groups can still compare bare vendors, so this only blocks the whole tab
  // when there is genuinely nothing to pick from.
  if ((groups ?? []).length === 0 && (availableVendors ?? []).length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Vendor Group maupun vendor yang bisa dibandingkan.</span>{' '}
          <Link href="/vendor-groups" className="text-primary underline">
            Buat satu dulu
          </Link>
          <span>.</span>
        </p>
      </div>
    )
  }

  const coverage = data?.coverage ?? null
  const rawCoveragePct =
    coverage && coverage.revenuePeriod > 0
      ? Math.round((coverage.revenueInColumns / coverage.revenuePeriod) * 100)
      : null
  // A present coverage object with a missing revenueInColumns (an older/partial backend response)
  // divides undefined by a number, giving NaN — which is not null, so it would otherwise sail
  // through a plain `!= null` check and print "mencakup NaN% revenue periode ini". Number.isFinite
  // rejects both NaN and null in one guard, falling back to the same no-coverage wording below.
  const coveragePct = Number.isFinite(rawCoveragePct) ? rawCoveragePct : null
  // A missing divisor (no routes with data in that column) is omitted rather than defaulted to 0,
  // per the service's own footer comment: 0 reads as a measurement ("0 rute"), not as "unknown".
  const divisorNote = (data?.columns ?? [])
    .map((column, i) => {
      const routesWithData = data?.footer[i]?.routesWithData
      return routesWithData == null ? null : `${column.name} = ${routesWithData} rute`
    })
    .filter((entry): entry is string => entry != null)
    .join(', ')

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        {(groups ?? []).length > 0 && (
          <>
            <p className="mb-2 text-sm font-medium">Vendor Group</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(groups ?? []).map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${group.name} (${group.vendors.length} vendor)`}
                    checked={picks.some((p) => p.kind === 'group' && p.id === group.id)}
                    onChange={() => toggleGroup(group.id)}
                  />
                  <span>{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.vendors.length} vendor
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-sm font-medium">Vendor</p>
        <MultiVendorFilter
          className="w-[260px]"
          vendors={(availableVendors ?? []).map((v) => v.vendor)}
          selected={pickedVendors}
          onChange={setVendorNames}
        />

        {atLimit && (
          <p className="mt-2 text-xs text-amber-600">
            {`Maksimum ${MAX_VENDOR_COLUMNS} kolom. Lepas satu pilihan dulu untuk menambah yang lain.`}
          </p>
        )}

        {overlaps.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {/* Built as one interpolated string rather than mixed JSX children, so the whole
                sentence lands in a single text node the tests can match on. */}
            {overlaps.map((o) => (
              <p key={o.vendor}>
                {`${o.columnNames.join(', ')} sama-sama memuat vendor ${o.vendor} — angkanya dihitung di setiap kolom, jadi kolom-kolom ini tidak boleh dijumlahkan.`}
              </p>
            ))}
          </div>
        )}
      </div>

      {picks.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih minimal satu vendor group atau vendor untuk melihat perbandingan.
          </p>
        </div>
      ) : isLoading ? (
        <div className="h-[420px] animate-pulse rounded-lg border bg-card" />
      ) : isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load the comparison.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="space-y-2">
          {/* Permanent, not conditional on a threshold. Only about a third of TOs carry a vendor,
              so without this the table reads as a decomposition of period revenue and quietly
              loses the rest. */}
          <div className="rounded-md bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {coveragePct != null
              ? `Kolom di bawah mencakup ${coveragePct}% revenue periode ini. Sisanya berasal dari TO di luar kolom-kolom ini — lihat catatan di bawah.`
              : 'Kolom di bawah hanya mencakup TO yang punya vendor. Porsinya belum bisa dihitung dari response ini.'}
          </div>

          {/* Revenue is SUM(revenue_total), gross — revenue_discount is never subtracted. Margin
              does subtract it, so the two columns do not differ by Cost alone. */}
          <p className="text-xs text-muted-foreground">
            Kolom Revenue di sini bruto (belum dikurangi discount), sama seperti tab Daily Report.
            Margin sudah dikurangi discount, jadi Revenue − Cost tidak sama dengan Margin —
            selisihnya adalah discount.
          </p>

          <PnlComparisonTable
            model={toVendorComparisonTable(data)}
            firstColumnHeader="Route"
            cellHint="Lihat AWB kolom ini pada rute ini"
            onCellClick={
              onCellClick
                ? (column, rowKey) => {
                    // A group with no members yields `vendors: []`, which routeToParams drops —
                    // the drilldown would then show every vendor's AWBs on this route, which is
                    // not what this column represents. An empty column has nothing to drill into.
                    if (column.vendors.length === 0) return
                    onCellClick(routeFromVendorComparisonCell(column, rowKey, bounds))
                  }
                : undefined
            }
          />

          {/* The same footer slot divides by calendar days in Route Comparison. Named here rather
              than in the row label because routesWithData differs per column, and one label cannot
              honestly state N divisors. */}
          <p className="text-xs text-muted-foreground">
            {`Avg / Route dibagi jumlah rute yang punya data di kolom itu, bukan seluruh rute — jadi pembaginya bisa berbeda antar kolom: ${divisorNote}.`}
          </p>

          <p
            data-testid="vendor-comparison-gap-note"
            className="text-xs text-muted-foreground"
          >
            Kolom-kolom ini tidak menjumlah ke total periode. Penyebab yang paling umum: TO dari
            vendor lain yang belum dicentang di atas — centang vendornya untuk memasukkannya. Di
            luar itu ada beberapa kasus data yang lebih jarang: TO tanpa booking sehingga
            vendornya kosong (no_booking); TO yang nama vendornya string kosong, yang jatuh ke
            smu_rate_missing dan bukan no_booking; dan TO ber-station_mapping_missing, yang punya
            vendor dan biaya tetapi belum punya rute sehingga tidak muncul di baris mana pun.
          </p>

          {/* Not in the task-11 brief's step-3 code — added per the task instructions: earlier
              backend tasks deliberately left this reconciliation note for the UI to state. Clicking
              a cell opens an AWB drilldown whose totals will not equal the cell: the drilldown sums
              every TO of a matched AWB using MAX(cost_*_awb), while this cell uses a weight_share
              prorata for one station pair. The mismatch is by design and cannot be removed. */}
          <p
            data-testid="vendor-comparison-drilldown-note"
            className="text-xs text-muted-foreground"
          >
            Klik sel untuk membuka daftar AWB pendukungnya — tetapi totalnya tidak akan sama
            dengan angka sel ini. Daftar AWB menjumlah seluruh TO pada AWB yang cocok memakai
            MAX(cost_*_awb), sedangkan sel ini memakai prorata weight_share untuk satu pasang
            stasiun saja. Perbedaan ini disengaja dan tidak bisa dihilangkan.
          </p>

          <p className="text-xs text-muted-foreground">
            Angka di sini juga tidak akan sama dengan panel Cost by Vendor di tab Estimated: panel
            itu memakai rollup per-AWB, sedangkan tabel ini memakai prorata weight_share per rute.
          </p>
        </div>
      ) : null}
    </div>
  )
}
