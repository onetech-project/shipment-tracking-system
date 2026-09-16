import { FleetAlertsService } from './fleet-alerts.service'

// Every case fixes 'today' so the assertions do not drift as the calendar moves.
const TODAY = '2026-09-16'

function docRow(over: Record<string, unknown> = {}) {
  return {
    vehicleId: 'v-1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    driverName: 'Ahmad Fauzi',
    docTypeId: 'dt-kir',
    label: 'KIR',
    expiresAt: '2026-09-20',
    warnDays: 30,
    ...over,
  }
}

function simRow(over: Record<string, unknown> = {}) {
  return {
    driverId: 'dr-1',
    driverName: 'Ahmad Fauzi',
    nopol: 'B 9114 KYZ',
    vehicleId: 'v-1',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    label: 'SIM B2 Umum',
    expiresAt: '2026-09-25',
    warnDays: 30,
    ...over,
  }
}

function build(docs: unknown[] = [], sims: unknown[] = []) {
  const qb = (rows: unknown[]) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => rows),
  })
  const docRepo = { createQueryBuilder: jest.fn(() => qb(docs)) }
  const driverRepo = { createQueryBuilder: jest.fn(() => qb(sims)) }
  return {
    service: new FleetAlertsService(docRepo as never, driverRepo as never),
    docRepo,
    driverRepo,
  }
}

describe('FleetAlertsService.list', () => {
  it('reports a vehicle document that is inside its threshold', async () => {
    const { service } = build([docRow()])
    const [alert] = await service.list(50, TODAY)

    expect(alert).toMatchObject({
      kind: 'document',
      vehicleId: 'v-1',
      nopol: 'B 9114 KYZ',
      label: 'KIR',
      expiresAt: '2026-09-20',
      daysLeft: 4,
      severity: 'warn',
    })
  })

  // The licence belongs to the person, not the unit, which is why it is left out of a vehicle's
  // worstSeverity — this list is where the two are merged (spec §5, Alert).
  it('reports a driver licence alongside vehicle documents', async () => {
    const { service } = build([], [simRow()])
    const [alert] = await service.list(50, TODAY)

    expect(alert).toMatchObject({
      kind: 'sim',
      label: 'SIM B2 Umum',
      driverName: 'Ahmad Fauzi',
      daysLeft: 9,
      severity: 'warn',
    })
  })

  // Most urgent first is the whole point of the section: an expired paper must never sit below
  // one that is merely due soon.
  it('sorts by days left, expired first', async () => {
    const { service } = build(
      [
        docRow({ docTypeId: 'a', label: 'STNK', expiresAt: '2026-09-30' }),
        docRow({ docTypeId: 'b', label: 'KIR', expiresAt: '2026-09-09' }),
      ],
      [simRow({ expiresAt: '2026-09-18' })],
    )
    const alerts = await service.list(50, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['KIR', 'SIM B2 Umum', 'STNK'])
    expect(alerts.map((a) => a.daysLeft)).toEqual([-7, 2, 14])
  })

  // The threshold is per type, read from master data (spec §2.8): a 14-day type must not be
  // reported at day 20 just because another type warns at 30.
  it('measures each row against its own type threshold', async () => {
    const { service } = build([
      docRow({ docTypeId: 'a', label: 'Uji Emisi', expiresAt: '2026-09-30', warnDays: 7 }),
      docRow({ docTypeId: 'b', label: 'KIR', expiresAt: '2026-09-30', warnDays: 30 }),
    ])
    const alerts = await service.list(50, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['KIR'])
  })

  it('reports a licence against the threshold of that driver own jenis_sim row', async () => {
    const { service } = build([], [simRow({ expiresAt: '2026-10-10', warnDays: 7 })])
    await expect(service.list(50, TODAY)).resolves.toEqual([])
  })

  // A type whose warn_days is NULL falls back to 30, matching both the view and severityFor. If
  // this drifted, a row could appear in the list with an 'ok' badge.
  it('falls back to thirty days when a type names no threshold', async () => {
    const { service } = build([docRow({ expiresAt: '2026-10-10', warnDays: null })])
    const alerts = await service.list(50, TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('warn')
  })

  it('marks an expired paper crit and reports a negative daysLeft', async () => {
    const { service } = build([docRow({ expiresAt: '2026-09-09' })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ daysLeft: -7, severity: 'crit' })
  })

  // A paper expiring today is still valid for the rest of the business day — warn, not crit.
  // This mirrors severityFor and the SQL view; disagreeing would colour the row differently from
  // the badge on the same unit in the table below.
  it('calls a paper that expires today warn, not crit', async () => {
    const { service } = build([docRow({ expiresAt: TODAY })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ daysLeft: 0, severity: 'warn' })
  })

  it('caps the list at the requested limit, keeping the most urgent', async () => {
    const { service } = build([
      docRow({ docTypeId: 'a', label: 'A', expiresAt: '2026-09-30' }),
      docRow({ docTypeId: 'b', label: 'B', expiresAt: '2026-09-09' }),
      docRow({ docTypeId: 'c', label: 'C', expiresAt: '2026-09-20' }),
    ])
    const alerts = await service.list(2, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['B', 'C'])
  })

  it('returns an empty list when nothing is due', async () => {
    const { service } = build([], [])
    await expect(service.list(50, TODAY)).resolves.toEqual([])
  })

  // An archived unit is out of the register; alerting on its papers would send an operator to
  // renew the KIR of a truck that was sold.
  it('asks only for live units and active drivers', async () => {
    const { service, docRepo, driverRepo } = build()
    await service.list(50, TODAY)

    const docQb = docRepo.createQueryBuilder.mock.results[0].value
    // where() and andWhere() both land on the mock's own call lists, so both must be checked —
    // a condition on either is equally load-bearing and a mutation to either must be caught.
    const docConditions = [...docQb.where.mock.calls, ...docQb.andWhere.mock.calls]
      .map((c: unknown[]) => String(c[0]))
      .join(' ')
    expect(docConditions).toContain('isActive')
    // Superseded document rows must not reappear once a newer one supersedes them.
    expect(docConditions).toContain('isCurrent')

    const simQb = driverRepo.createQueryBuilder.mock.results[0].value
    const simConditions = [...simQb.where.mock.calls, ...simQb.andWhere.mock.calls]
      .map((c: unknown[]) => String(c[0]))
      .join(' ')
    expect(simConditions).toContain('isActive')
  })

  // A driver with no vehicle still holds a licence, and it still expires. The row is reported
  // with no plate rather than dropped.
  it('reports a licence for a driver assigned to no vehicle', async () => {
    const { service } = build([], [simRow({ vehicleId: null, nopol: null })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ kind: 'sim', vehicleId: null, nopol: null, driverName: 'Ahmad Fauzi' })
  })
})
