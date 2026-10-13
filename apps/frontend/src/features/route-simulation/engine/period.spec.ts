import { nextPeriod, periodParts, periodShort, periodsBetween, periodsForward } from './period'

describe('period helpers', () => {
  it('parses and labels a half-month cycle', () => {
    expect(periodParts('2026-05-2H')).toEqual({ year: 2026, month: 5, half: 2 })
    expect(periodParts('2026-05')).toBeNull()
    expect(periodShort('2026-05-2H')).toBe('Mei 2026 H2')
  })

  it('steps across a year boundary', () => {
    expect(nextPeriod(2026, 12, 2)).toEqual([2027, 1, 1])
    expect(nextPeriod(2026, 3, 1)).toEqual([2026, 3, 2])
  })

  it('lists every half-month inclusive and is empty when start is after end', () => {
    expect(periodsBetween('2026-11-2H', '2027-01-1H')).toEqual(['2026-11-2H', '2026-12-1H', '2026-12-2H', '2027-01-1H'])
    expect(periodsBetween('2026-06-1H', '2026-05-1H')).toEqual([])
  })

  it('lists periods forward from a start, crossing the year', () => {
    expect(periodsForward('2026-11-2H', 4)).toEqual(['2026-11-2H', '2026-12-1H', '2026-12-2H', '2027-01-1H'])
    expect(periodsForward('nope', 3)).toEqual([])
  })
})
