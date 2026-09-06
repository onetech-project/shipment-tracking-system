import {
  cycleDateRange,
  isValidCycle,
  mapSlaRoutes,
  previousCycle,
  routeKey,
  routeLabel,
  slaRouteKey,
  splitRouteKey,
} from './cycle'

describe('cycle arithmetic', () => {
  it('splits a half-cycle into its calendar days', () => {
    expect(cycleDateRange('2026-05-1H')).toEqual({ start: '2026-05-01', end: '2026-05-15' })
    // The second half runs to the real month end, which February makes non-obvious.
    expect(cycleDateRange('2026-02-2H')).toEqual({ start: '2026-02-16', end: '2026-02-28' })
    expect(cycleDateRange('2026-05-2H')).toEqual({ start: '2026-05-16', end: '2026-05-31' })
  })

  it('steps back one half-cycle, crossing month and year boundaries', () => {
    expect(previousCycle('2026-05-2H')).toBe('2026-05-1H')
    expect(previousCycle('2026-05-1H')).toBe('2026-04-2H')
    expect(previousCycle('2026-01-1H')).toBe('2025-12-2H')
  })

  it('rejects labels that are not half-cycles', () => {
    expect(isValidCycle('2026-05-1H')).toBe(true)
    expect(isValidCycle('2026-13-1H')).toBe(false)
    expect(isValidCycle('2026-05')).toBe(false)
    expect(isValidCycle('')).toBe(false)
  })
})

describe('route naming', () => {
  it('builds and splits a route key', () => {
    expect(routeKey('Jabo', 'Denpasar')).toBe('Jabo|Denpasar')
    expect(splitRouteKey('Jabo|Denpasar')).toEqual({ origin: 'Jabo', dest: 'Denpasar' })
  })

  it('labels the Jakarta hub by its airport code', () => {
    expect(routeLabel('Jabo', 'Denpasar')).toBe('CGK → Denpasar')
    // Anything without a mapping keeps its own name rather than disappearing.
    expect(routeLabel('Surabaya', 'Batam')).toBe('Surabaya → Batam')
  })
})

describe('mapSlaRoutes', () => {
  it('maps SLA route strings onto P&L route keys', () => {
    // SLA names the Jakarta hub "Kosambi" and suffixes every station with " DC".
    expect(slaRouteKey('Kosambi DC - Aceh DC')).toBe('Jabo|Aceh')
  })

  it('reports the strings it could not map instead of dropping them', () => {
    const result = mapSlaRoutes([
      { route: 'Kosambi DC - Aceh DC', percentage: 90, onTimeWeight: 9, lateWeight: 1 },
      { route: 'nonsense', percentage: 50, onTimeWeight: 1, lateWeight: 1 },
    ])
    expect(Array.from(result.mapped.keys())).toEqual(['Jabo|Aceh'])
    expect(result.unmapped).toEqual(['nonsense'])
  })
})
