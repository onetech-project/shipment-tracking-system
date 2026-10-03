import { fixtureSource } from './__fixtures__/source'
import { buildLanes, createState, fromPayload, histDays, laneId, toPayloadWithSource } from './state'
import { SimulationSource } from '../types'

describe('createState', () => {
  const src = fixtureSource()

  it('defaults the history range to the last six cycles and SMU cost', () => {
    const s = createState(src)
    expect(s.histStart).toBe('2026-06-1H')
    expect(s.histEnd).toBe('2026-08-2H')
    expect(histDays(s)).toBe(90)
    expect(s.costBasis).toBe('smu')
  })

  it('starts with one empty account per vendor that has data, ESP flagged', () => {
    const s = createState(src)
    expect(s.accounts.map((a) => a.id)).toEqual(['ESP', 'PELITA', 'PRIME', 'SILI'])
    expect(s.accounts.find((a) => a.id === 'ESP')!.isEsp).toBe(true)
    expect(s.accounts.every((a) => a.tranches.length === 1 && a.tranches[0].amount === 0)).toBe(true)
  })

  it('uses the net SPX rate and drops nothing from routes', () => {
    const custom: SimulationSource = { ...src, routes: [{ ...src.routes[0], rateSpx: 32000, pph2: 640, disc15: 480 }] }
    expect(createState(custom).routes[0].rateSpx).toBe(30880)
  })
})

describe('buildLanes', () => {
  it('builds one lane per booked vendor x airline and skips unbooked rows', () => {
    const src = fixtureSource()
    src.history.push({ ...src.history[0], vendor: null, airline: null })
    const s = createState(src)
    expect(s.lanes.some((l) => l.vendor === '' || l.vendor == null)).toBe(false)
    expect(s.lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))).toBeDefined()
  })

  it('computes cost/kg on the chosen basis and load as the best cycle per day', () => {
    const src = fixtureSource()
    // Make SMU and all-in disagree on one lane.
    src.history.forEach((h) => {
      if (h.vendor === 'SILI' && h.dest === 'Aceh') h.laneCostAll = h.laneCostSmu * 2
    })
    const s = createState(src)
    const smu = s.lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))!
    const all = buildLanes(src, { ...s, costBasis: 'all' }).find((l) => l.id === smu.id)!
    expect(all.costPerKg).toBeCloseTo(smu.costPerKg * 2, -1)
    const inRange = src.history.filter((h) => h.vendor === 'SILI' && h.dest === 'Aceh' && h.airline === 'Garuda Air CGK' && h.cycle >= '2026-06')
    expect(smu.loadKg).toBe(Math.round(Math.max(...inRange.map((h) => h.weight)) / 15))
  })

  it('marks a lane with no known cost so the optimizer can skip it', () => {
    const src = fixtureSource()
    src.history.forEach((h) => {
      if (h.vendor === 'PRIME' && h.dest === 'Aceh') { h.laneWeightSmu = 0; h.laneCostSmu = 0 }
    })
    const lane = createState(src).lanes.find((l) => l.id === laneId('PRIME', 'Jabo|Aceh', 'Garuda Air CGK'))!
    expect(lane.costKnown).toBe(false)
    expect(lane.costPerKg).toBe(0)
  })

  it('applies user edits over the data and remembers which fields were edited', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const id = s0.lanes[0].id
    const s = { ...s0, laneEdits: { [id]: { costPerKg: 1, enabled: false as const } } }
    const lane = buildLanes(src, s).find((l) => l.id === id)!
    expect(lane.costPerKg).toBe(1)
    expect(lane.enabled).toBe(false)
    expect(lane.edited).toEqual({ costPerKg: true, loadKg: false })
    expect(lane.db.costPerKg).toBe(s0.lanes[0].costPerKg)
  })
})

describe('payload round trip', () => {
  it('restores every user edit, including custom and removed routes', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const edited = {
      ...s0,
      costBasis: 'all' as const,
      routes: [
        ...s0.routes.filter((r) => r.key !== 'Jabo|Ambon').map((r) => (r.key === 'Jabo|Aceh' ? { ...r, rateSpx: 1, overrideTon: 50 } : r)),
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', key: 'Jabo|Manado', rateSpx: 40000, slots: [], overrideTon: 100, custom: true },
      ],
      sim: { days: 10, cash: { 'ESP-x': 5 }, kg: { a: 1 } },
    }
    const back = fromPayload(src, toPayloadWithSource(src, edited))
    expect(back.costBasis).toBe('all')
    expect(back.routes.find((r) => r.key === 'Jabo|Aceh')).toMatchObject({ rateSpx: 1, overrideTon: 50 })
    expect(back.routes.find((r) => r.key === 'Jabo|Ambon')).toBeUndefined()
    expect(back.routes.find((r) => r.key === 'Jabo|Manado')).toMatchObject({ custom: true })
    expect(back.sim).toEqual(edited.sim)
  })

  it('keeps routes that appeared in the source after the scenario was saved', () => {
    const src = fixtureSource()
    const payload = toPayloadWithSource(src, createState(src))
    const grown: SimulationSource = { ...src, routes: [...src.routes, { origin: 'Jabo', originLabel: 'CGK', dest: 'Ternate', rateSpx: 35000, pph2: 0, disc15: 0, hasData: false }] }
    expect(fromPayload(grown, payload).routes.some((r) => r.key === 'Jabo|Ternate')).toBe(true)
  })
})
