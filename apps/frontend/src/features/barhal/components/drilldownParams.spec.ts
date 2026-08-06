import { drilldownParamsFor } from './BarhalRecapToTable'
import { BarhalRecapPerRuteItem, BarhalRecapPerTanggalItem } from '../types'
import { BarhalDashboardParams } from '../hooks/useBarhalDashboard'

const dateRow: BarhalRecapPerTanggalItem = {
  date: '2026-08-06',
  totalTo: 10,
  totalKoli: 20,
  weightBefore: 100,
  weightAfter: 95,
  chwt: 96,
  variance: -1,
  variancePercent: -1.04,
  addRevenue: 50000,
  status: 'completed',
}

const routeRow: BarhalRecapPerRuteItem = {
  originName: 'CGK',
  destName: 'SUB',
  totalTo: 5,
  totalKoli: 8,
  weightBefore: 40,
  weightAfter: 38,
  chwt: 39,
  variance: -1,
  variancePercent: -2.5,
  addRevenue: 20000,
  status: 'incomplete',
}

describe('drilldownParamsFor', () => {
  it('inverts a date row into a route-grouped drilldown scoped to that single date', () => {
    const filters: BarhalDashboardParams = {}
    const result = drilldownParamsFor(dateRow, 'date', filters)
    expect(result.groupBy).toBe('route')
    expect(result.startDate).toBe(dateRow.date)
    expect(result.endDate).toBe(dateRow.date)
  })

  it('inverts a route row into a date-grouped drilldown scoped to that origin/dest', () => {
    const filters: BarhalDashboardParams = {}
    const result = drilldownParamsFor(routeRow, 'route', filters)
    expect(result.groupBy).toBe('date')
    expect(result.origin).toBe(routeRow.originName)
    expect(result.dest).toBe(routeRow.destName)
  })

  it('passes dashboard filters through for a date row', () => {
    const filters: BarhalDashboardParams = { origin: 'CGK', dest: 'SUB' }
    const result = drilldownParamsFor(dateRow, 'date', filters)
    expect(result.origin).toBe('CGK')
    expect(result.dest).toBe('SUB')
  })

  it('passes dashboard filters through for a route row', () => {
    const filters: BarhalDashboardParams = { startDate: '2026-08-01', endDate: '2026-08-31' }
    const result = drilldownParamsFor(routeRow, 'route', filters)
    expect(result.startDate).toBe('2026-08-01')
    expect(result.endDate).toBe('2026-08-31')
  })

  it('lets the clicked date row win over conflicting startDate/endDate filters', () => {
    const filters: BarhalDashboardParams = { startDate: '2026-01-01', endDate: '2026-01-31' }
    const result = drilldownParamsFor(dateRow, 'date', filters)
    expect(result.startDate).toBe(dateRow.date)
    expect(result.endDate).toBe(dateRow.date)
  })

  it('lets the clicked route row win over conflicting origin/dest filters', () => {
    const filters: BarhalDashboardParams = { origin: 'DPS', dest: 'MES' }
    const result = drilldownParamsFor(routeRow, 'route', filters)
    expect(result.origin).toBe(routeRow.originName)
    expect(result.dest).toBe(routeRow.destName)
  })
})
