import { fixtureSource } from './__fixtures__/source'
import { buildLanes, clampHorizon, createState, fromPayload, histDays, horizonDays, isScenarioPayload, laneId, simStartOptions, toPayloadWithSource } from './state'
import { SimulationSource } from '../types'

describe('createState', () => {
  const src = fixtureSource()

  it('defaults the history range to the last six cycles', () => {
    const s = createState(src)
    expect(s.histStart).toBe('2026-06-1H')
    expect(s.histEnd).toBe('2026-08-2H')
    expect(histDays(s)).toBe(90)
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

  it('starts the simulation right after the last cycle, 12 periods long', () => {
    const s = createState(src)
    expect(s.simStart).toBe('2026-09-1H')
    expect(s.horizonPeriods).toBe(12)
    expect(horizonDays(s)).toBe(180)
    expect(simStartOptions(src)).toHaveLength(12)
    expect(simStartOptions(src)[0]).toBe('2026-09-1H')
    expect(simStartOptions({ cycles: [] })).toEqual([])
  })

  it('clamps the horizon to 1..72 periods, defaulting an empty value to 12', () => {
    expect(clampHorizon(500)).toBe(72)
    expect(clampHorizon(-3)).toBe(1)
    expect(clampHorizon(null)).toBe(12)
    expect(clampHorizon('4')).toBe(4)
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

  it('prices a lane per cost component, totals them, and takes load as the best cycle per day', () => {
    const src = fixtureSource()
    src.history.forEach((h) => {
      if (h.vendor === 'SILI' && h.dest === 'Aceh') {
        h.laneCostSgOut = h.laneWeight * 1000
        h.laneCostSgIn = h.laneWeight * 200
        h.laneCostRa = h.laneWeight * 300
      }
    })
    const lane = createState(src).lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))!
    expect([lane.costSgOut, lane.costSgIn, lane.costRa]).toEqual([1000, 200, 300])
    expect(lane.costSmu).toBeGreaterThan(0)
    expect(lane.costPerKg).toBe(1000 + 200 + 300 + lane.costSmu)
    expect(lane.db.costPerKg).toBe(lane.costPerKg)
    const inRange = src.history.filter((h) => h.vendor === 'SILI' && h.dest === 'Aceh' && h.airline === 'Garuda Air CGK' && h.cycle >= '2026-06')
    expect(lane.loadKg).toBe(Math.round(Math.max(...inRange.map((h) => h.weight)) / 15))
  })

  it('marks a lane with no known cost so the optimizer can skip it', () => {
    const src = fixtureSource()
    src.history.forEach((h) => {
      if (h.vendor === 'PRIME' && h.dest === 'Aceh') Object.assign(h, { laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0 })
    })
    const lane = createState(src).lanes.find((l) => l.id === laneId('PRIME', 'Jabo|Aceh', 'Garuda Air CGK'))!
    expect(lane.costKnown).toBe(false)
    expect(lane.costPerKg).toBe(0)
  })

  it('applies a component edit over the data, re-totals, and remembers which fields were edited', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const base = s0.lanes[0]
    const s = { ...s0, laneEdits: { [base.id]: { costRa: 7, enabled: false as const } } }
    const lane = buildLanes(src, s).find((l) => l.id === base.id)!
    expect(lane.costRa).toBe(7)
    expect(lane.costPerKg).toBe(base.costPerKg - base.costRa + 7)
    expect(lane.enabled).toBe(false)
    expect(lane.edited).toEqual({ costSgOut: false, costSgIn: false, costRa: true, costSmu: false, costPerKg: true, loadKg: false })
    expect(lane.db.costRa).toBe(base.costRa)
  })
})

describe('payload round trip', () => {
  it('restores every user edit, including custom and removed routes', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const edited = {
      ...s0,
      routes: [
        ...s0.routes.filter((r) => r.key !== 'Jabo|Ambon').map((r) => (r.key === 'Jabo|Aceh' ? { ...r, rateSpx: 1, overrideTon: 50 } : r)),
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', key: 'Jabo|Manado', rateSpx: 40000, slots: [], overrideTon: 100, custom: true },
      ],
      simStart: '2026-10-2H', horizonPeriods: 6, histStart: '2026-03-1H',
      sim: { days: 10, cash: { 'ESP-x': 5 }, kg: { a: 1 } },
    }
    const back = fromPayload(src, toPayloadWithSource(src, edited))
    expect(back.routes.find((r) => r.key === 'Jabo|Aceh')).toMatchObject({ rateSpx: 1, overrideTon: 50 })
    expect(back.routes.find((r) => r.key === 'Jabo|Ambon')).toBeUndefined()
    expect(back.routes.find((r) => r.key === 'Jabo|Manado')).toMatchObject({ custom: true })
    expect(back.sim).toEqual(edited.sim)
    expect(back.simStart).toBe('2026-10-2H')
    expect(back.horizonPeriods).toBe(6)
    expect(back.histStart).toBe(s0.histStart) // the history range is not a scenario setting
  })

  it('keeps routes that appeared in the source after the scenario was saved', () => {
    const src = fixtureSource()
    const payload = toPayloadWithSource(src, createState(src))
    const grown: SimulationSource = { ...src, routes: [...src.routes, { origin: 'Jabo', originLabel: 'CGK', dest: 'Ternate', rateSpx: 35000, pph2: 0, disc15: 0, hasData: false }] }
    expect(fromPayload(grown, payload).routes.some((r) => r.key === 'Jabo|Ternate')).toBe(true)
  })

  it('tolerates a payload missing every optional key and still returns a usable state', () => {
    const src = fixtureSource()
    const s = fromPayload(src, { version: 2 } as never)
    expect(s.accounts).toEqual([])
    expect(s.laneEdits).toEqual({})
    expect(s.sim).toEqual({ days: 30, cash: {}, kg: null })
    expect(s.routes).toHaveLength(src.routes.length)
    const defaults = createState(src)
    expect(s.histStart).toBe(defaults.histStart)
    expect(s.histEnd).toBe(defaults.histEnd)
    expect(s.simStart).toBe(defaults.simStart)
    expect(s.horizonPeriods).toBe(12)
  })
})

describe('isScenarioPayload', () => {
  it('is true only for an object carrying version 2', () => {
    expect(isScenarioPayload({ version: 2 })).toBe(true)
    expect(isScenarioPayload({ version: 1 })).toBe(false)
    expect(isScenarioPayload({})).toBe(false)
    expect(isScenarioPayload(null)).toBe(false)
    expect(isScenarioPayload(undefined)).toBe(false)
    expect(isScenarioPayload('version 2')).toBe(false)
    expect(isScenarioPayload([])).toBe(false)
  })
})
