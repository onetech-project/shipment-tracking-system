import { PnlVendorComparison, PnlVendorComparisonColumn } from '../hooks/usePnl'
import {
  overlappingVendors,
  routeFromVendorComparisonCell,
  toVendorComparisonTable,
  vendorRowKey,
} from './vendorComparison'

const column = (over: Partial<PnlVendorComparisonColumn> = {}): PnlVendorComparisonColumn => ({
  id: 'v:ESP',
  name: 'ESP',
  kind: 'vendor',
  vendors: ['ESP'],
  vendorCount: 1,
  ...over,
})

function data(over: Partial<PnlVendorComparison> = {}): PnlVendorComparison {
  return {
    columns: [column()],
    rows: [
      {
        origin: 'Jabo',
        originLabel: 'CGK',
        dest: 'Denpasar',
        cells: [
          {
            revenue: 1000,
            cost: 600,
            margin: 385,
            costSmu: 400,
            costRa: 100,
            costSgOut: 50,
            costSgIn: 50,
            incompleteTos: 1,
            issues: [{ issue: 'no_booking', awbs: 2 }],
          },
        ],
      },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', cells: [null] },
    ],
    footer: [
      {
        totalRevenue: 1000,
        totalCost: 600,
        totalMargin: 385,
        totalCostSmu: 400,
        totalCostRa: 100,
        totalCostSgOut: 50,
        totalCostSgIn: 50,
        routesWithData: 1,
        avgRevenuePerRoute: 1000,
        avgCostPerRoute: 600,
        avgMarginPerRoute: 385,
        incompleteTos: 1,
        issues: [{ issue: 'no_booking', awbs: 5 }],
      },
    ],
    coverage: { revenueInColumns: 3020, revenuePeriod: 10000 },
    ...over,
  }
}

describe('toVendorComparisonTable', () => {
  it('keys rows by origin|dest and labels them with the display route form', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[0].rowKey).toBe('Jabo|Denpasar')
    // Formatted here, not in the renderer: the renderer serves two axes and must not know this one
    // holds routes.
    expect(model.rows[0].rowLabel).toBe('CGK → Denpasar')
  })

  it('carries revenue, cost, margin and the four components index-aligned with the columns', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[0].revenue).toEqual([1000])
    expect(model.rows[0].cost).toEqual([600])
    expect(model.rows[0].margin).toEqual([385])
    expect(model.rows[0].components.costSmu).toEqual([400])
    expect(model.rows[0].components.costSgIn).toEqual([50])
    expect(model.rows[0].warnings).toEqual([
      { issues: [{ issue: 'no_booking', awbs: 2 }], incompleteTos: 1 },
    ])
  })

  it('renders an absent cell as null everywhere rather than zero', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[1].revenue).toEqual([null])
    expect(model.rows[1].margin).toEqual([null])
    expect(model.rows[1].components.costRa).toEqual([null])
    expect(model.rows[1].warnings).toEqual([{ issues: [], incompleteTos: 0 }])
  })

  it('builds a Total row that expands and an Avg / Route row that does not', () => {
    const model = toVendorComparisonTable(data())

    expect(model.footerRows.map((f) => f.label)).toEqual(['Total', 'Avg / Route'])
    expect(model.footerRows[0].margin).toEqual([385])
    expect(model.footerRows[0].components!.costSmu).toEqual([400])
    expect(model.footerRows[1].margin).toEqual([385])
    // The average of a cost component is not itself a cost anyone books.
    expect(model.footerRows[1].components).toBeNull()
    expect(model.footerRows[1].warnings).toBeNull()
  })

  // Frontend and backend deploy in parallel, so a new frontend can briefly hit a backend whose
  // footer has no averages. null renders as an em dash; NaN would render as 'NaN'.
  it('returns null, not NaN, for averages an older backend did not send', () => {
    const stale = data()
    delete (stale.footer[0] as Partial<PnlVendorComparison['footer'][number]>).avgMarginPerRoute
    delete (stale.footer[0] as Partial<PnlVendorComparison['footer'][number]>).totalMargin

    const model = toVendorComparisonTable(stale)

    expect(model.footerRows[0].margin).toEqual([null])
    expect(model.footerRows[1].margin).toEqual([null])
  })
})

describe('overlappingVendors', () => {
  it('names every column that shares a vendor', () => {
    expect(
      overlappingVendors([
        column({ id: 'vg:a', name: 'Group A', kind: 'group', vendors: ['ESP', 'Angkasa'], vendorCount: 2 }),
        column({ id: 'vg:b', name: 'Group B', kind: 'group', vendors: ['ESP'], vendorCount: 1 }),
        column({ id: 'v:Kargo', name: 'Kargo', vendors: ['Kargo'] }),
      ]),
    ).toEqual([{ vendor: 'ESP', columnNames: ['Group A', 'Group B'] }])
  })

  it('says nothing when no vendor appears twice', () => {
    expect(overlappingVendors([column()])).toEqual([])
  })
})

describe('routeFromVendorComparisonCell', () => {
  it('splits the row key at the first pipe and spans the whole period', () => {
    expect(
      routeFromVendorComparisonCell(
        column({ vendors: ['ESP', 'Angkasa'] }),
        'Jabo|Denpasar',
        { min: '2026-05-01', max: '2026-05-15' },
      ),
    ).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      vendors: ['ESP', 'Angkasa'],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  it('omits the dates when the period has no derivable bounds', () => {
    expect(routeFromVendorComparisonCell(column(), 'Jabo|Aceh', { min: '', max: '' })).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      vendors: ['ESP'],
    })
  })
})

describe('vendorRowKey', () => {
  it('matches the key the projection produces', () => {
    expect(vendorRowKey({ origin: 'Jabo', dest: 'Denpasar' })).toBe('Jabo|Denpasar')
  })
})
