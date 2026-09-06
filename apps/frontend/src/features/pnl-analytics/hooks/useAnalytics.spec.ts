/**
 * The hooks are thin, but the request params are not: a wrong param name here produces a silently
 * empty tab rather than an error, so the mapping is pinned directly.
 */
import { analyticsFilterToParams, slaRangeForFilter } from './useAnalytics'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'

describe('analyticsFilterToParams', () => {
  it('sends the cycle in cycle mode', () => {
    const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }
    expect(analyticsFilterToParams(filter)).toEqual({ cycle: '2026-05-1H', basis: 'atd_origin' })
  })

  it('sends start and end in range mode', () => {
    const filter: PnlFilter = {
      mode: 'range',
      start: '2026-05-01',
      end: '2026-05-09',
      basis: 'ata_vendor_wh_destination',
    }
    expect(analyticsFilterToParams(filter)).toEqual({
      start: '2026-05-01',
      end: '2026-05-09',
      basis: 'ata_vendor_wh_destination',
    })
  })
})

describe('slaRangeForFilter', () => {
  it('expands a first-half cycle to its calendar days', () => {
    const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }
    expect(slaRangeForFilter(filter)).toEqual({ startDate: '2026-05-01', endDate: '2026-05-15' })
  })

  it('passes a custom range straight through', () => {
    const filter: PnlFilter = {
      mode: 'range',
      start: '2026-05-04',
      end: '2026-05-06',
      basis: 'atd_origin',
    }
    expect(slaRangeForFilter(filter)).toEqual({ startDate: '2026-05-04', endDate: '2026-05-06' })
  })
})
