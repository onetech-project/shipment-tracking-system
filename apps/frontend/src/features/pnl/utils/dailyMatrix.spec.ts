import { PnlDailyMatrix } from '../hooks/usePnl'
import {
  formatDayLabel,
  groupOrigins,
  offerableRoutes,
  routeFromCell,
  selectMatrixColumns,
  toMarginTable,
  toRevenueTable,
  unionRoutes,
} from './dailyMatrix'
import { hasWarning } from './cellWarning'

const matrix: PnlDailyMatrix = {
  columns: [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Ambon' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ],
  rows: [
    {
      date: '2026-07-01',
      cells: [
        {
          revenue: 1000, margin: 100, weight: 10, incompleteTos: 0, revenueMissingTos: 0,
          issues: [{ issue: 'revenue_missing', awbs: 1 }],
        },
        null,
        {
          revenue: 0, margin: -50, weight: 5, incompleteTos: 2, revenueMissingTos: 0,
          issues: [{ issue: 'no_booking', awbs: 2 }, { issue: 'revenue_missing', awbs: 1 }],
        },
      ],
    },
    { date: '2026-07-02', cells: [null, null, null] },
  ],
  footer: [
    {
      totalRevenue: 1000, totalMargin: 100, totalWeight: 10,
      avgRevenuePerDay: 500, avgMarginPerDay: 50,
      marginPct: 10, spacePerKg: 10, incompleteTos: 0, revenueMissingTos: 0,
      issues: [{ issue: 'revenue_missing', awbs: 1 }],
    },
    {
      totalRevenue: 0, totalMargin: 0, totalWeight: 0,
      avgRevenuePerDay: 0, avgMarginPerDay: 0,
      marginPct: null, spacePerKg: null, incompleteTos: 0, revenueMissingTos: 0, issues: [],
    },
    {
      totalRevenue: 0, totalMargin: -50, totalWeight: 5,
      avgRevenuePerDay: 0, avgMarginPerDay: -25,
      marginPct: null, spacePerKg: -10, incompleteTos: 2, revenueMissingTos: 0,
      issues: [{ issue: 'no_booking', awbs: 3 }, { issue: 'revenue_missing', awbs: 1 }],
    },
  ],
  periodDays: 2,
}

// Every footer fixture above leaves revenueMissingTos at 0, so `f.revenueMissingTos ?? 0` in both
// toRevenueTable (dailyMatrix.ts:80) and toMarginTable (dailyMatrix.ts:111) would return 0 whether
// the mapping is correct or hardcoded to 0 — the field only ever varies on a CELL in this file. This
// fixture sets it non-zero on a footer row and pairs it with incompleteTos and a cost issue, so the
// two tables' different treatment of the same footer row is visible: revenueWarning() keeps the
// count but drops the cost issue and zeroes incompleteTos, while toMarginTable keeps all three
// unfiltered because margin is spoiled by a missing revenue AND a missing cost alike.
const missingRevenueFooter: PnlDailyMatrix = {
  ...matrix,
  footer: [
    {
      ...matrix.footer[0],
      incompleteTos: 7,
      revenueMissingTos: 4,
      issues: [{ issue: 'no_booking', awbs: 5 }],
    },
    matrix.footer[1],
    matrix.footer[2],
  ],
}

describe('groupOrigins', () => {
  it('collapses consecutive columns sharing an origin label into spans', () => {
    expect(groupOrigins(matrix.columns)).toEqual([
      { label: 'CGK', span: 2 },
      { label: 'SUB', span: 1 },
    ])
  })

  it('returns no groups for no columns', () => {
    expect(groupOrigins([])).toEqual([])
  })
})

describe('formatDayLabel', () => {
  it('renders a YYYY-MM-DD date as d-Mon-YYYY', () => {
    expect(formatDayLabel('2026-07-01')).toBe('1-Jul-2026')
    expect(formatDayLabel('2026-12-25')).toBe('25-Dec-2026')
  })
})

describe('toRevenueTable', () => {
  const model = toRevenueTable(matrix)

  it('takes revenue from each cell and null from absent cells', () => {
    expect(model.values).toEqual([
      [1000, null, 0],
      [null, null, null],
    ])
  })

  it('carries the dates and columns through unchanged', () => {
    expect(model.dates).toEqual(['2026-07-01', '2026-07-02'])
    expect(model.columns).toBe(matrix.columns)
  })

  it('has exactly the Total and Avg / Day footer rows', () => {
    expect(model.footerRows.map((r) => r.label)).toEqual(['Total', 'Avg / Day'])
    expect(model.footerRows[0].values).toEqual([1000, 0, 0])
    expect(model.footerRows[1].values).toEqual([500, 0, 0])
    expect(model.footerRows.every((r) => r.format === 'number')).toBe(true)
  })

  it('warns only on revenue issues — cost issues and incomplete TOs cannot move SUM(revenue)', () => {
    const model = toRevenueTable(matrix)
    // Column 3 carries both kinds. Only the revenue half survives, and its 2 cost-less TOs go.
    expect(model.warnings[0][2]).toEqual({
      issues: [{ issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 0,
      revenueMissingTos: 0,
    })
    expect(model.warnings[0][0]).toEqual({
      issues: [{ issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 0,
      revenueMissingTos: 0,
    })
    expect(model.warnings[0][1]).toEqual({ issues: [], incompleteTos: 0, revenueMissingTos: 0 })
    expect(model.highlightNegative).toBe(false)
  })

  it('leaves a cost-only cell clean, so yellow here always means revenue', () => {
    const costOnly: PnlDailyMatrix = {
      ...matrix,
      rows: [
        {
          date: '2026-07-01',
          cells: [
            {
              revenue: 500, margin: 10, weight: 1, incompleteTos: 3, revenueMissingTos: 0,
              issues: [{ issue: 'smu_rate_missing', awbs: 2 }],
            },
            null,
            null,
          ],
        },
      ],
    }
    expect(toRevenueTable(costOnly).warnings[0][0]).toEqual({
      issues: [],
      incompleteTos: 0,
      revenueMissingTos: 0,
    })
  })

  it('gives an absent cell a clean warning rather than undefined', () => {
    // Row 2 has no shipments at all. A missing entry here would make every consumer null-check.
    expect(toRevenueTable(matrix).warnings[1]).toEqual([
      { issues: [], incompleteTos: 0, revenueMissingTos: 0 },
      { issues: [], incompleteTos: 0, revenueMissingTos: 0 },
      { issues: [], incompleteTos: 0, revenueMissingTos: 0 },
    ])
  })

  it('scopes both footer rows to revenue too, since Avg / Day divides the same total', () => {
    const [total, avg] = toRevenueTable(matrix).footerRows
    const expectedWarning = {
      issues: [{ issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 0,
      revenueMissingTos: 0,
    }
    expect(total.warnings?.[2]).toEqual(expectedWarning)
    expect(avg.warnings?.[2]).toEqual(expectedWarning)
  })

  it('warns a revenue cell whose TOs have no revenue, even when the issue names a cost cause', () => {
    // The exact case that made Revenue cells stop going yellow: a TO with no rate_spx has no
    // revenue AND no cost fallback, and v_pnl_to.issue ranks the cost cause first.
    const revenueMissing: PnlDailyMatrix = {
      ...matrix,
      rows: [
        {
          date: '2026-07-01',
          cells: [
            {
              revenue: 0, margin: 0, weight: 0, incompleteTos: 1, revenueMissingTos: 2,
              issues: [{ issue: 'no_booking', awbs: 1 }],
            },
            null,
            null,
          ],
        },
      ],
    }

    const model = toRevenueTable(revenueMissing)
    const warning = model.warnings[0][0]

    expect(hasWarning(warning)).toBe(true)
    expect(warning.revenueMissingTos).toBe(2)
    // Still no cost noise on this table.
    expect(warning.issues).toEqual([])
    expect(warning.incompleteTos).toBe(0)
  })

  it('pins the footer revenue-missing count through to the table, not hardcoded to 0', () => {
    // Kills a mutation of dailyMatrix.ts:80 (`f.revenueMissingTos ?? 0` -> `0`): the count keeps
    // flowing through revenueWarning(), while the cost issue and incompleteTos it arrived with are
    // scrubbed, exactly like a cell warning would be.
    const model = toRevenueTable(missingRevenueFooter)
    const expectedWarning = { issues: [], incompleteTos: 0, revenueMissingTos: 4 }
    expect(model.footerRows[0].warnings?.[0]).toEqual(expectedWarning)
    expect(model.footerRows[1].warnings?.[0]).toEqual(expectedWarning)
  })
})

describe('toMarginTable', () => {
  const model = toMarginTable(matrix)

  it('takes margin from each cell and null from absent cells', () => {
    expect(model.values).toEqual([
      [100, null, -50],
      [null, null, null],
    ])
  })

  it('has the five spreadsheet footer rows in order', () => {
    expect(model.footerRows.map((r) => r.label)).toEqual([
      'Total',
      'Avg / Day',
      '% Margin',
      'Total Tonase',
      'Space per Kg',
    ])
  })

  it('maps each footer row to the matching footer field', () => {
    const [total, avg, pct, tonase, space] = model.footerRows
    expect(total.values).toEqual([100, 0, -50])
    expect(avg.values).toEqual([50, 0, -25])
    expect(pct.values).toEqual([10, null, null])
    expect(tonase.values).toEqual([10, 0, 5])
    expect(space.values).toEqual([10, null, -10])
  })

  it('marks only the percent row as a percentage', () => {
    expect(model.footerRows.map((r) => r.format)).toEqual([
      'number', 'number', 'percent', 'number', 'number',
    ])
  })

  it('keeps every warning on the margin table — margin is spoiled by revenue AND cost alike', () => {
    const model = toMarginTable(matrix)
    expect(model.warnings[0][2]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 2 }, { issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 2,
      revenueMissingTos: 0,
    })
    expect(model.footerRows[0].warnings?.[2]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 3 }, { issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 2,
      revenueMissingTos: 0,
    })
    expect(model.highlightNegative).toBe(true)
  })

  it('warns every footer row derived from totalMargin, but not gross weight', () => {
    const [total, avg, pct, tonase, space] = toMarginTable(matrix).footerRows
    const expectedWarning = {
      issues: [{ issue: 'no_booking', awbs: 3 }, { issue: 'revenue_missing', awbs: 1 }],
      incompleteTos: 2,
      revenueMissingTos: 0,
    }
    // Avg / Day, % Margin and Space per Kg all divide totalMargin, so they inherit its warning.
    expect(total.warnings?.[2]).toEqual(expectedWarning)
    expect(avg.warnings?.[2]).toEqual(expectedWarning)
    expect(pct.warnings?.[2]).toEqual(expectedWarning)
    expect(space.warnings?.[2]).toEqual(expectedWarning)
    // Total Tonase is gross weight: it never touches cost, so it deliberately stays clean.
    expect(tonase.warnings).toBeUndefined()
  })

  it('pins the footer revenue-missing count through unfiltered, unlike the revenue table', () => {
    // Kills a mutation of dailyMatrix.ts:111 (`f.revenueMissingTos ?? 0` -> `0`). Same fixture as
    // toRevenueTable's equivalent test, but here the whole warning survives unfiltered — margin is
    // spoiled by a missing revenue and a missing cost alike — which must differ from that table's
    // filtered result.
    const model = toMarginTable(missingRevenueFooter)
    const expectedWarning = {
      issues: [{ issue: 'no_booking', awbs: 5 }],
      incompleteTos: 7,
      revenueMissingTos: 4,
    }
    expect(model.footerRows[0].warnings?.[0]).toEqual(expectedWarning)
    expect(model.footerRows[1].warnings?.[0]).toEqual(expectedWarning)
    expect(model.footerRows[2].warnings?.[0]).toEqual(expectedWarning)
    expect(model.footerRows[4].warnings?.[0]).toEqual(expectedWarning)
  })
})

describe('routeFromCell', () => {
  it('maps a CGK column to the raw origin the drilldown filters on', () => {
    const route = routeFromCell({ origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' }, '2026-05-01')
    expect(route).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Tanjung Pinang' }],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })

  it('maps a SUB column the same way', () => {
    const route = routeFromCell({ origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' }, '2026-05-20')
    expect(route).toEqual({
      routes: [{ origin: 'Surabaya', dest: 'Pontianak' }],
      dateFrom: '2026-05-20',
      dateTo: '2026-05-20',
    })
  })
})

describe('selectMatrixColumns', () => {
  const jaboAceh = { origin: 'Jabo', dest: 'Aceh' }
  const subPontianak = { origin: 'Surabaya', dest: 'Pontianak' }

  it('returns every column when nothing is picked, so an untouched tab shows the whole report', () => {
    expect(selectMatrixColumns(matrix, [])).toBe(matrix)
  })

  it('drops an unpicked column together with its cells and footer at the same index', () => {
    const picked = selectMatrixColumns(matrix, [subPontianak])

    expect(picked.columns).toEqual([{ origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' }])
    expect(picked.rows[0].cells).toEqual([matrix.rows[0].cells[2]])
    expect(picked.footer).toEqual([matrix.footer[2]])
    expect(picked.periodDays).toBe(matrix.periodDays)
    expect(picked.rows.map((r) => r.date)).toEqual(['2026-07-01', '2026-07-02'])
  })

  it('keeps the matrix column order, not the pick order, so origin header spans stay whole', () => {
    // groupOrigins merges CONSECUTIVE same-origin columns; ordering by clicks would fracture them.
    const picked = selectMatrixColumns(matrix, [subPontianak, jaboAceh])
    expect(picked.columns.map((c) => c.dest)).toEqual(['Aceh', 'Pontianak'])
  })

  it('renders a picked route with no data as an empty column rather than dropping it', () => {
    // What the user ticked must stay visible: an absent column reads as a broken filter, while an
    // all-em-dash column reads as the real answer — nothing flew this route in this period.
    const picked = selectMatrixColumns(matrix, [{ origin: 'Jabo', dest: 'Batam' }])

    expect(picked.columns).toEqual([{ origin: 'Jabo', originLabel: 'CGK', dest: 'Batam' }])
    expect(picked.rows.map((r) => r.cells)).toEqual([[null], [null]])
    expect(picked.footer).toEqual([
      {
        totalRevenue: 0, totalMargin: 0, totalWeight: 0,
        avgRevenuePerDay: 0, avgMarginPerDay: 0,
        marginPct: null, spacePerKg: null, incompleteTos: 0, revenueMissingTos: 0, issues: [],
      },
    ])
  })

  it('places an empty column inside its origin block so the header span does not fracture', () => {
    const picked = selectMatrixColumns(matrix, [
      jaboAceh,
      subPontianak,
      { origin: 'Jabo', dest: 'Batam' },
    ])
    expect(picked.columns.map((c) => `${c.originLabel}-${c.dest}`)).toEqual([
      'CGK-Aceh',
      'CGK-Batam',
      'SUB-Pontianak',
    ])
    expect(groupOrigins(picked.columns)).toEqual([
      { label: 'CGK', span: 2 },
      { label: 'SUB', span: 1 },
    ])
  })

  it('appends an empty column whose origin the matrix does not know at all', () => {
    const picked = selectMatrixColumns(matrix, [{ origin: 'Medan', dest: 'Batam' }, jaboAceh])
    expect(picked.columns.map((c) => `${c.originLabel}-${c.dest}`)).toEqual(['CGK-Aceh', 'Medan-Batam'])
  })

  it('still returns columns when no pick matches, rather than a table with none', () => {
    const picked = selectMatrixColumns(matrix, [{ origin: 'Medan', dest: 'Batam' }])
    expect(picked.columns).toHaveLength(1)
    expect(picked.rows.map((r) => r.cells)).toEqual([[null], [null]])
  })

  it('leaves the source matrix untouched', () => {
    const before = JSON.stringify(matrix)
    selectMatrixColumns(matrix, [subPontianak])
    expect(JSON.stringify(matrix)).toBe(before)
  })
})

describe('unionRoutes', () => {
  const jaboAceh = { origin: 'Jabo', dest: 'Aceh' }
  const jaboBatam = { origin: 'Jabo', dest: 'Batam' }
  const subPtk = { origin: 'Surabaya', dest: 'Pontianak' }

  it('returns the picked routes when no group is chosen', () => {
    expect(unionRoutes([jaboAceh], [])).toEqual([jaboAceh])
  })

  it('returns the group members when nothing was picked by hand', () => {
    expect(unionRoutes([], [jaboAceh, jaboBatam])).toEqual([jaboAceh, jaboBatam])
  })

  it('puts the hand-picked routes first, then the group members', () => {
    expect(unionRoutes([subPtk], [jaboAceh])).toEqual([subPtk, jaboAceh])
  })

  it('counts a route on both sides exactly once', () => {
    // Ticking a route and then picking a group that contains it must not double it: the pick is
    // deliberately kept in scope so that changing group later restores it ticked.
    expect(unionRoutes([jaboAceh], [jaboAceh, jaboBatam])).toEqual([jaboAceh, jaboBatam])
  })

  it('is empty only when both sides are', () => {
    expect(unionRoutes([], [])).toEqual([])
  })
})

describe('offerableRoutes', () => {
  const all = [
    { origin: 'Jabo', dest: 'Aceh' },
    { origin: 'Jabo', dest: 'Batam' },
    { origin: 'Surabaya', dest: 'Pontianak' },
  ]

  it('offers everything when no group is chosen', () => {
    expect(offerableRoutes(all, [])).toEqual(all)
  })

  it('withholds the routes the chosen group already covers', () => {
    // A checkbox that changes nothing is worse than one that is absent: unticking a route the
    // group still supplies would leave it filtered anyway.
    expect(offerableRoutes(all, [{ origin: 'Jabo', dest: 'Aceh' }])).toEqual([
      { origin: 'Jabo', dest: 'Batam' },
      { origin: 'Surabaya', dest: 'Pontianak' },
    ])
  })

  it('ignores a group member the list does not carry', () => {
    // The Estimated tab lists only pairs that have flown, while a group is built from the master,
    // so a group can legitimately name a route this dropdown never offered.
    expect(offerableRoutes(all, [{ origin: 'Jabo', dest: 'Manokwari' }])).toEqual(all)
  })

  it('can withhold everything', () => {
    expect(offerableRoutes(all, all)).toEqual([])
  })
})
