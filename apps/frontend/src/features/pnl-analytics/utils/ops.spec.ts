import { offloadView, slaView } from './ops'
import { SlaOverview } from '../types'

const sla: SlaOverview = {
  summary: {
    alerts: {
      melewatiSla: { routes: 3, tonnage: 1200 },
      reservasiKapal: { routes: 0, tonnage: 0 },
      spxSlaAlert: { routes: 1, tonnage: 400 },
    },
    otp: {
      percentage: 88,
      onTimeWeight: 8800,
      lateWeight: 1200,
      breakdown: [
        { route: 'Kosambi DC - Denpasar DC', percentage: 95, onTimeWeight: 950, lateWeight: 50 },
        { route: 'Kosambi DC - Batam DC', percentage: 60, onTimeWeight: 600, lateWeight: 400 },
        // No measurement at all: its 0% is an upstream 0/0, not a failing route.
        { route: 'Kosambi DC - Aceh DC', percentage: 0, onTimeWeight: 0, lateWeight: 0 },
        { route: 'nonsense', percentage: 10, onTimeWeight: 1, lateWeight: 9 },
      ],
    },
  },
}

describe('slaView', () => {
  it('ranks routes worst-first — the table exists to surface failures', () => {
    const v = slaView(sla)
    expect(v.byRoute.map((r) => r.routeKey)).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
    expect(v.byRoute[0].label).toBe('CGK → Batam')
  })

  it('separates routes with no measurement from routes that are failing', () => {
    const v = slaView(sla)
    expect(v.byRoute.some((r) => r.routeKey === 'Jabo|Aceh')).toBe(false)
    expect(v.noDataRoutes.map((r) => r.routeKey)).toEqual(['Jabo|Aceh'])
  })

  it('reports route strings it could not map', () => {
    expect(slaView(sla).unmapped).toEqual(['nonsense'])
  })

  it("trusts the API's own headline when unscoped", () => {
    const v = slaView(sla)
    expect(v.scoped).toBe(false)
    expect(v.otpPct).toBe(88)
    expect(v.onTimeWeight).toBe(8800)
  })

  it('recomputes the headline from measured routes only when scoped', () => {
    const v = slaView(sla, ['Jabo|Denpasar', 'Jabo|Batam', 'Jabo|Aceh'])
    expect(v.scoped).toBe(true)
    expect(v.onTimeWeight).toBe(1550)
    expect(v.lateWeight).toBe(450)
    // The zero-weight Aceh route is not in the denominator, so it cannot drag the figure down.
    expect(v.otpPct).toBeCloseTo(77.5, 6)
  })

  it('lists only alerts that carry something, heaviest first', () => {
    expect(slaView(sla).alerts.map((a) => a.type)).toEqual(['melewatiSla', 'spxSlaAlert'])
    expect(slaView(sla).alerts[0].label).toBe('Past SLA')
  })

  it('returns an empty view for a missing response rather than throwing', () => {
    const v = slaView(undefined)
    expect(v).toMatchObject({ otpPct: 0, byRoute: [], noDataRoutes: [], alerts: [], unmapped: [] })
  })
})

describe('offloadView', () => {
  const offloaded = [
    { awb: 'A1', airline: 'Lion' },
    { awb: 'A2', airline: 'Lion' },
    { awb: 'A3', airline: 'Garuda' },
    { awb: 'UNKNOWN', airline: 'Garuda' },
  ]
  const awbs = [
    { awb: 'A1', origin: 'Jabo', dest: 'Denpasar' },
    { awb: 'A2', origin: 'Jabo', dest: 'Denpasar' },
    { awb: 'A3', origin: 'Jabo', dest: 'Batam' },
  ]

  it('counts by airline and, where the AWB joins, by route', () => {
    const v = offloadView(offloaded, awbs)
    expect(v.count).toBe(4)
    expect(v.byAirline).toEqual([
      { name: 'Lion', count: 2 },
      { name: 'Garuda', count: 2 },
    ])
    expect(v.byRoute).toEqual([
      { routeKey: 'Jabo|Denpasar', label: 'CGK → Denpasar', count: 2 },
      { routeKey: 'Jabo|Batam', label: 'CGK → Batam', count: 1 },
    ])
  })

  it('reports the join rate, because AWB formats differ between the two sources', () => {
    expect(offloadView(offloaded, awbs).joinRatePct).toBeCloseTo(75, 6)
    expect(offloadView([], awbs).joinRatePct).toBe(0)
  })

  // The fixture above ties Lion and Garuda at 2 apiece, which makes the airline comparator's
  // direction unobservable. Distinct counts pin "worst offender first".
  it('ranks airlines by offload count, heaviest first', () => {
    const v = offloadView(
      [
        { awb: 'B1', airline: 'Garuda' },
        { awb: 'B2', airline: 'Lion' },
        { awb: 'B3', airline: 'Lion' },
        { awb: 'B4', airline: 'Lion' },
        { awb: 'B5', airline: 'Citilink' },
        { awb: 'B6', airline: 'Citilink' },
      ],
      awbs,
    )
    expect(v.byAirline).toEqual([
      { name: 'Lion', count: 3 },
      { name: 'Citilink', count: 2 },
      { name: 'Garuda', count: 1 },
    ])
  })
})
