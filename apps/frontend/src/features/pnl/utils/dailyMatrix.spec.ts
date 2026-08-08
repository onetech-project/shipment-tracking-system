import { PnlDailyMatrix } from '../hooks/usePnl'
import { formatDayLabel, groupOrigins, toMarginTable, toRevenueTable } from './dailyMatrix'

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
        { revenue: 1000, margin: 100, weight: 10, incompleteTos: 0 },
        null,
        { revenue: 0, margin: -50, weight: 5, incompleteTos: 2 },
      ],
    },
    { date: '2026-07-02', cells: [null, null, null] },
  ],
  footer: [
    {
      totalRevenue: 1000, totalMargin: 100, totalWeight: 10,
      avgRevenuePerDay: 500, avgMarginPerDay: 50,
      marginPct: 10, spacePerKg: 10, incompleteTos: 0,
    },
    {
      totalRevenue: 0, totalMargin: 0, totalWeight: 0,
      avgRevenuePerDay: 0, avgMarginPerDay: 0,
      marginPct: null, spacePerKg: null, incompleteTos: 0,
    },
    {
      totalRevenue: 0, totalMargin: -50, totalWeight: 5,
      avgRevenuePerDay: 0, avgMarginPerDay: -25,
      marginPct: null, spacePerKg: -10, incompleteTos: 2,
    },
  ],
  periodDays: 2,
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

  it('does not flag incomplete cost, which does not affect revenue', () => {
    expect(model.incompleteTos).toBeNull()
    expect(model.highlightNegative).toBe(false)
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

  it('exposes per-cell incomplete-cost counts and highlights negatives', () => {
    expect(model.incompleteTos).toEqual([
      [0, 0, 2],
      [0, 0, 0],
    ])
    expect(model.highlightNegative).toBe(true)
  })
})
