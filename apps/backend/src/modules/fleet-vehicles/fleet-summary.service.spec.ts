import { FleetSummaryService } from './fleet-summary.service'

function vehicle(over: Record<string, unknown> = {}) {
  return {
    id: 'v',
    nopol: 'B 1 A',
    worstSeverity: 'ok',
    isActive: true,
    lease: null,
    ...over,
  }
}

function build(rows: unknown[]) {
  const vehicles = { findAll: jest.fn(async () => ({ rows, total: rows.length, page: 1, pageSize: 1000 })) }
  return { service: new FleetSummaryService(vehicles as never), vehicles }
}

describe('FleetSummaryService', () => {
  it('counts registered units and the two severity buckets', async () => {
    const { service } = build([
      vehicle({ worstSeverity: 'crit' }),
      vehicle({ worstSeverity: 'crit' }),
      vehicle({ worstSeverity: 'warn' }),
      vehicle({ worstSeverity: 'ok' }),
      vehicle({ worstSeverity: 'none' }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      totalUnit: 5,
      dokumenKedaluwarsa: 2,
      jatuhTempo30Hari: 1,
    })
  })

  it('totals the monthly instalment and the remaining obligation', async () => {
    const { service } = build([
      vehicle({ lease: { cicilanPerBulan: 8750000, sisaAngsuran: 18, sisaKewajiban: 157500000 } }),
      vehicle({ lease: { cicilanPerBulan: 5000000, sisaAngsuran: 4, sisaKewajiban: 20000000 } }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      cicilanPerBulan: 13750000,
      sisaKewajiban: 177500000,
    })
  })

  // A settled contract is history: counting it would report an obligation the company no longer
  // has. The prototype applied the same rule (a.aktif && a.sisa > 0 in renderTiles).
  it('leaves a fully paid contract out of both money totals', async () => {
    const { service } = build([
      vehicle({ lease: { cicilanPerBulan: 8750000, sisaAngsuran: 0, sisaKewajiban: 0 } }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      cicilanPerBulan: 0,
      sisaKewajiban: 0,
    })
  })

  it('reports zeroes for an empty register', async () => {
    const { service } = build([])
    await expect(service.summary()).resolves.toEqual({
      totalUnit: 0,
      dokumenKedaluwarsa: 0,
      jatuhTempo30Hari: 0,
      cicilanPerBulan: 0,
      sisaKewajiban: 0,
    })
  })

  // Archived units are out of the register (spec §8): a sold truck must not inflate the count or
  // the obligation. findAll's default already excludes them, which is why it is reused rather
  // than queried afresh.
  //
  // Protects against a truncated summary: this is a count of the whole register, not of a page
  // of it, so page/pageSize must cover every unit in one pass. A mutation that shrinks pageSize
  // would silently make the tiles report a PARTIAL total for any fleet larger than that page, and
  // every fixture in this file is small enough that only pinning the call shape (not the totals
  // it produces) can catch that. SUMMARY_PAGE_SIZE is not exported by the service, so the literal
  // it holds today (1000) is asserted directly rather than imported.
  it('asks for the whole register in one pass, not a page of it', async () => {
    const { service, vehicles } = build([])
    await service.summary()
    expect(vehicles.findAll).toHaveBeenCalledWith({
      page: 1,
      pageSize: 1000,
      includeArchived: false,
    })
  })
})
