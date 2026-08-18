import { toComparisonTable, overlappingRoutes, COST_COMPONENTS } from './groupComparison'
import { PnlGroupComparison, PnlGroupComparisonCell, PnlGroupComparisonColumn } from '../hooks/usePnl'

const cell = (over: Partial<PnlGroupComparisonCell> = {}): PnlGroupComparisonCell => ({
  revenue: 0,
  cost: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  ...over,
})

const data: PnlGroupComparison = {
  columns: [
    { id: 'g1', name: 'Kalimantan', routeCount: 3, kind: 'group', routes: [] },
    { id: 'g2', name: 'Sumatera', routeCount: 2, kind: 'group', routes: [] },
  ],
  rows: [
    {
      date: '2026-05-01',
      cells: [
        cell({ revenue: 1000, cost: 800, costSmu: 500, costRa: 100, costSgOut: 150, costSgIn: 50, incompleteTos: 2 }),
        null,
      ],
    },
  ],
  footer: [
    {
      totalRevenue: 1000,
      totalCost: 800,
      totalCostSmu: 500,
      totalCostRa: 100,
      totalCostSgOut: 150,
      totalCostSgIn: 50,
      avgRevenuePerDay: 66.6,
      avgCostPerDay: 53.3,
      incompleteTos: 2,
    },
    {
      totalRevenue: 0,
      totalCost: 0,
      totalCostSmu: 0,
      totalCostRa: 0,
      totalCostSgOut: 0,
      totalCostSgIn: 0,
      avgRevenuePerDay: 0,
      avgCostPerDay: 0,
      incompleteTos: 0,
    },
  ],
  periodDays: 15,
}

describe('COST_COMPONENTS', () => {
  it('lists the four components in the order finance reads them', () => {
    expect(COST_COMPONENTS.map((c) => c.key)).toEqual([
      'costSmu',
      'costRa',
      'costSgOut',
      'costSgIn',
    ])
    expect(COST_COMPONENTS.map((c) => c.label)).toEqual(['SMU', 'RA', 'SG Out', 'SG In'])
  })
})

describe('toComparisonTable', () => {
  it('splits each row into revenue, cost and component tracks aligned with columns', () => {
    const model = toComparisonTable(data)

    expect(model.columns).toEqual(data.columns)
    expect(model.rows[0].date).toBe('2026-05-01')
    expect(model.rows[0].revenue).toEqual([1000, null])
    expect(model.rows[0].cost).toEqual([800, null])
    expect(model.rows[0].components.costSmu).toEqual([500, null])
    expect(model.rows[0].components.costSgIn).toEqual([50, null])
  })

  // An absent cell must stay distinguishable from a real zero all the way to the renderer.
  it('keeps a missing cell as null rather than collapsing it to zero', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].revenue[1]).toBeNull()
    expect(model.rows[0].components.costRa[1]).toBeNull()
  })

  it('reports incomplete TOs per column as a number, defaulting to zero', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].incompleteTos).toEqual([2, 0])
  })

  it('builds a Total footer row that expands and an Avg / Day row that does not', () => {
    const model = toComparisonTable(data)

    expect(model.footerRows.map((r) => r.label)).toEqual(['Total', 'Avg / Day'])
    expect(model.footerRows[0].revenue).toEqual([1000, 0])
    expect(model.footerRows[0].components!.costSmu).toEqual([500, 0])
    expect(model.footerRows[0].incompleteTos).toEqual([2, 0])
    // Averages have no component breakdown — an average of a component is not a cost.
    expect(model.footerRows[1].components).toBeNull()
    expect(model.footerRows[1].revenue).toEqual([66.6, 0])
  })
})

describe('overlappingRoutes', () => {
  const aceh = { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }
  const medan = { origin: 'Jabo', originLabel: 'CGK', dest: 'Medan' }

  const column = (over: Partial<PnlGroupComparisonColumn>): PnlGroupComparisonColumn => ({
    id: 'g1', name: 'Kalimantan', routeCount: 1, kind: 'group', routes: [aceh], ...over,
  })

  it('names every column that holds a shared route', () => {
    const overlaps = overlappingRoutes([
      column({ id: 'g1', name: 'Kalimantan', routes: [aceh, medan] }),
      column({ id: 'g2', name: 'Sumatera', routes: [aceh] }),
    ])
    expect(overlaps).toEqual([{ route: 'CGK → Aceh', groupNames: ['Kalimantan', 'Sumatera'] }])
  })

  it('catches a bare route column that duplicates a group member', () => {
    // This is the case the old RouteGroup-driven version could not see at all.
    const overlaps = overlappingRoutes([
      column({ id: 'g1', name: 'Kalimantan', routes: [aceh] }),
      column({ id: 'r:Jabo|Aceh', name: 'CGK → Aceh', kind: 'route', routes: [aceh] }),
    ])
    expect(overlaps).toEqual([{ route: 'CGK → Aceh', groupNames: ['Kalimantan', 'CGK → Aceh'] }])
  })

  it('says nothing when the columns are disjoint', () => {
    expect(
      overlappingRoutes([
        column({ id: 'g1', routes: [aceh] }),
        column({ id: 'g2', name: 'Sumatera', routes: [medan] }),
      ]),
    ).toEqual([])
  })
})
