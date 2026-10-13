import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../engine/__fixtures__/source'
import { initReducer, simReducer, ReducerState } from './reducer'

const src = fixtureSource()
const base = (): ReducerState => {
  const s = initReducer(src)
  return { ...s, sim: { ...s.sim, accounts: PROTOTYPE_ACCOUNTS } }
}

it('starts clean and marks dirty on any edit', () => {
  const s0 = initReducer(src)
  expect(s0.dirty).toBe(false)
  const s1 = simReducer(s0, { type: 'rateSet', key: 'Jabo|Aceh', value: 1 })
  expect(s1.dirty).toBe(true)
  expect(s1.sim.routes.find((r) => r.key === 'Jabo|Aceh')!.rateSpx).toBe(1)
})

it('adds an account under any trimmed name, flags ESP case-insensitively, and confirms', () => {
  let s = simReducer(base(), { type: 'acctDel', id: 'ESP' })
  s = simReducer(s, { type: 'acctAdd', vendor: ' esp ', trancheId: 't1' })
  expect(s.sim.accounts.at(-1)).toMatchObject({ id: 'esp', name: 'esp', isEsp: true })
  expect(s.flash).toBe('Akun esp ditambahkan. Isi modal, COF, dan siklus bayar sesuai kebutuhan.')
  s = simReducer(s, { type: 'acctAdd', vendor: 'Garuda Cargo', trancheId: 't2' })
  expect(s.sim.accounts.at(-1)).toMatchObject({ id: 'Garuda Cargo', isEsp: false })
})

it('refuses an empty or duplicate account name', () => {
  const empty = simReducer(base(), { type: 'acctAdd', vendor: '   ', trancheId: 't' })
  expect(empty.flash).toBe('Nama vendor tidak boleh kosong')
  expect(empty.sim.accounts).toHaveLength(4)
  const dup = simReducer(base(), { type: 'acctAdd', vendor: 'SILI', trancheId: 't' })
  expect(dup.flash).toBe('Akun SILI sudah ada')
})

it('re-totals a lane when one cost component is edited, and reset restores the data', () => {
  const s = base()
  const lane = s.sim.lanes[0]
  const edited = simReducer(s, { type: 'laneSet', id: lane.id, field: 'costRa', value: lane.costRa + 500 })
  const after = edited.sim.lanes.find((l) => l.id === lane.id)!
  expect(after.costRa).toBe(lane.costRa + 500)
  expect(after.costPerKg).toBe(lane.costPerKg + 500)
  const reset = simReducer(edited, { type: 'laneReset', id: lane.id })
  expect(reset.sim.laneEdits[lane.id]).toBeUndefined()
  expect(reset.sim.lanes.find((l) => l.id === lane.id)!.costPerKg).toBe(lane.costPerKg)
})

it('treats typing the data value back as clearing the edit', () => {
  const s = base()
  const lane = s.sim.lanes[0]
  const out = simReducer(s, { type: 'laneSet', id: lane.id, field: 'loadKg', value: lane.db.loadKg })
  expect(out.sim.laneEdits[lane.id]).toBeUndefined()
})

it('adds and removes accounts and tranches, cleaning Coba-coba cash', () => {
  let s = base()
  s = simReducer(s, { type: 'simCash', trancheId: 'PELITA-1', value: 5 })
  s = simReducer(s, { type: 'trDel', trancheId: 'PELITA-1' })
  expect(s.sim.sim.cash['PELITA-1']).toBeUndefined()
  s = simReducer(s, { type: 'acctDel', id: 'PELITA' })
  expect(s.sim.accounts.some((a) => a.id === 'PELITA')).toBe(false)
  s = simReducer(s, { type: 'acctAdd', vendor: 'PELITA', trancheId: 'PELITA-new' })
  expect(s.sim.accounts.find((a) => a.id === 'PELITA')!.tranches[0].id).toBe('PELITA-new')
})

it('adds a custom route and rejects a duplicate', () => {
  const s = simReducer(base(), { type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 40000, overrideTon: 100 } })
  expect(s.sim.routes.at(-1)).toMatchObject({ key: 'Jabo|Manado', custom: true, overrideTon: 100 })
  const dup = simReducer(s, { type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 1, overrideTon: 1 } })
  expect(dup.flash).toMatch(/sudah ada/)
})

it('seeds manual kg from the recommendation on the first edit and reverts with simAuto', () => {
  let s = base()
  const lane = s.sim.lanes[0].id
  s = simReducer(s, { type: 'simKg', id: lane, value: 9 })
  expect(s.sim.sim.kg![lane]).toBe(9)
  expect(Object.keys(s.sim.sim.kg!).length).toBeGreaterThan(1)
  s = simReducer(s, { type: 'simAuto' })
  expect(s.sim.sim.kg).toBeNull()
})

it('loads a scenario clean and marks saved clean', () => {
  const s = simReducer(base(), { type: 'rateSet', key: 'Jabo|Aceh', value: 1 })
  const loaded = simReducer(s, { type: 'load', sim: initReducer(src).sim })
  expect(loaded.dirty).toBe(false)
  expect(simReducer(s, { type: 'markSaved' }).dirty).toBe(false)
})

it('applies the simulation range with a confirmation and clamps the horizon', () => {
  const s = simReducer(base(), { type: 'setSimRange', simStart: '2026-10-1H', horizonPeriods: 500 })
  expect(s.sim.simStart).toBe('2026-10-1H')
  expect(s.sim.horizonPeriods).toBe(72)
  expect(s.dirty).toBe(true)
  expect(s.flash).toBe('Estimasi dijalankan: mulai Okt 2026 H1, 72 periode')
})

it('confirms a re-run of the same range without marking the state dirty', () => {
  const s = simReducer(base(), { type: 'setSimRange', simStart: '2026-09-1H', horizonPeriods: 12 })
  expect(s.dirty).toBe(false)
  expect(s.flash).toBe('Estimasi dijalankan: mulai Sep 2026 H1, 12 periode')
})
