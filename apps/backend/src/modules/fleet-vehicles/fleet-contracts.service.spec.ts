import { ConflictException, NotFoundException } from '@nestjs/common'
import { FleetContractsService } from './fleet-contracts.service'
import { todayISO } from './fleet-severity'

const OPEN = {
  id: 'c-1',
  vehicleId: 'v-1',
  leasing: { id: 'm-1', code: 'mtf', label: 'MTF' },
  nomorKontrak: 'MTF-2024-03-11872',
  cicilanPerBulan: '8750000.00',
  tenorBulan: 48,
  angsuranMulai: '2024-03-11',
  angsuranTerbayarOverride: null,
  closedAt: null,
  createdAt: '2024-03-11',
}

// The two fields list() actually orders by. NULLS FIRST on ASC so the open contract (closedAt
// null) leads regardless of how many closed ones follow it — the same rule Postgres's own ASC
// default applies here.
function sortByOrder(rows: Record<string, unknown>[], order: Record<string, 'ASC' | 'DESC'> = {}) {
  const keys = Object.entries(order)
  return [...rows].sort((a, b) => {
    for (const [key, dir] of keys) {
      const av = a[key] as string | null
      const bv = b[key] as string | null
      if (av === bv) continue
      if (av == null) return dir === 'ASC' ? -1 : 1
      if (bv == null) return dir === 'ASC' ? 1 : -1
      const cmp = av < bv ? -1 : 1
      return dir === 'ASC' ? cmp : -cmp
    }
    return 0
  })
}

function build(rows: unknown[] = [OPEN], one: unknown = OPEN) {
  const repo = {
    // A fixed array can't tell a sorted query from an unsorted one — it would stay green even if
    // the order option were dropped or reversed. This fake sorts the fixture the way a real
    // repository would, the same technique masterRepo.count uses for its catalogue in
    // fleet-vehicles.service.spec.ts, so the row-order assertions below exercise the actual ORDER
    // BY the service asks for.
    find: jest.fn(async (opts: { order?: Record<string, 'ASC' | 'DESC'> }) =>
      sortByOrder(rows as Record<string, unknown>[], opts?.order),
    ),
    findOne: jest.fn(async () => one),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  return { service: new FleetContractsService(repo as never), repo }
}

describe('list', () => {
  it('reports the open contract with its arithmetic settled', async () => {
    const { service } = build()
    const [row] = await service.list('v-1')

    expect(row).toMatchObject({
      id: 'c-1',
      leasing: { label: 'MTF' },
      // Parsed from the numeric string pg returns, so no consumer has to decide how.
      cicilanPerBulan: 8750000,
      tenorBulan: 48,
    })
    expect(typeof row.sisaKewajiban).toBe('number')
  })

  // Closed contracts are the whole reason this table exists rather than columns on the vehicle:
  // a refinanced unit keeps what it used to pay.
  //
  // Protects against a silently unordered history panel: fed straight through, a mock repo can't
  // tell a sorted query from an unsorted one, so a prior version of this test passed a fixture
  // already in the expected order and would have stayed green even if list() dropped its order
  // option entirely. Rows here are given out of order, and two contracts share a closedAt date
  // (same-day closures), so only the fake's order-aware sort — and the createdAt DESC fallback it
  // is asked for — can produce the expected result.
  it('reports closed contracts too, newest first', async () => {
    const closedEarlier = { ...OPEN, id: 'c-0', closedAt: '2024-02-28', createdAt: '2023-11-01' }
    const closedLater = { ...OPEN, id: 'c-2', closedAt: '2024-02-28', createdAt: '2024-01-15' }
    const { service } = build([closedLater, OPEN, closedEarlier])
    const rows = await service.list('v-1')
    expect(rows.map((r) => r.id)).toEqual(['c-1', 'c-2', 'c-0'])
  })

  // The mock repo returns whatever array it is built with, order option or not — so the row-order
  // assertion above alone would pass even if list() asked the repo to sort the opposite way. Pin
  // the actual query the repo was asked to run.
  it('asks the repo for the open contract first, then closed newest first', async () => {
    const { service, repo } = build()
    await service.list('v-1')
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { closedAt: 'ASC', createdAt: 'DESC' } }),
    )
  })
})

describe('close', () => {
  it('stamps closedAt with today', async () => {
    const { service, repo } = build()
    await service.close('c-1')
    // Pinned to the real value, not just the YYYY-MM-DD shape — a fixed wrong date is still shaped
    // like a date, and a format-only assertion would wave it through.
    expect(repo.update).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ closedAt: todayISO() }),
    )
  })

  it('refuses an unknown contract', async () => {
    const { service } = build([], null)
    await expect(service.close('c-1')).rejects.toThrow(NotFoundException)
  })

  // Closing twice would move the date and rewrite when the obligation ended.
  it('refuses a contract that is already closed', async () => {
    const { service } = build([], { ...OPEN, closedAt: '2026-01-01' })
    await expect(service.close('c-1')).rejects.toThrow(ConflictException)
  })
})
