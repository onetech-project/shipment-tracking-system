import { SimulationHistoryRow, SimulationSource } from '../../types'

// Verbatim from the prototype (lines 119–141). Deterministic so parity numbers are stable.
function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rand01(seed: number): number {
  return ((seed * 2654435761) >>> 0) / 4294967295
}

type Seed = [string, string, string, number, [string, string, number, number][]]
export const SEED_ROUTES: Seed[] = [
  ['Jabo', 'CGK', 'Aceh', 21500, [['SILI', 'Garuda Air CGK', 19400, 215], ['PRIME', 'Garuda Air CGK', 19900, 135], ['ESP', 'Citilink CGK', 19100, 120]]],
  ['Jabo', 'CGK', 'Ambon', 26800, [['SILI', 'Garuda Air CGK', 24100, 175], ['SILI', 'Citilink CGK', 24600, 120], ['PRIME', 'Garuda Air CGK', 24900, 100]]],
  ['Jabo', 'CGK', 'Balikpapan', 17600, [['SILI', 'Garuda Air CGK', 15600, 345], ['SILI', 'Citilink CGK', 15900, 280], ['ESP', 'Garuda Air CGK', 15800, 175], ['ESP', 'Citilink CGK', 15300, 160]]],
  ['Jabo', 'CGK', 'Banjarmasin', 16200, [['SILI', 'Citilink CGK', 14500, 265], ['ESP', 'Pelita Air', 13900, 175], ['PELITA', 'Pelita Air', 14200, 145]]],
  ['Jabo', 'CGK', 'Batam', 14800, [['SILI', 'Citilink CGK', 13300, 300], ['PRIME', 'Garuda Air CGK', 13900, 145], ['ESP', 'Citilink CGK', 13100, 135]]],
  ['Jabo', 'CGK', 'Denpasar', 13900, [['SILI', 'Garuda Air CGK', 12600, 335], ['ESP', 'Pelita Air', 12100, 200], ['PELITA', 'Pelita Air', 12300, 165]]],
  ['Jabo', 'CGK', 'Kendari', 24200, [['SILI', 'Garuda Air CGK', 21900, 160], ['SILI', 'Citilink CGK', 22300, 120], ['SILI', 'Pelita Air', 21500, 100]]],
  ['Jabo', 'CGK', 'Makassar', 18900, [['SILI', 'Garuda Air CGK', 16900, 400], ['PRIME', 'Garuda Air CGK', 17400, 200], ['ESP', 'Citilink CGK', 16600, 185], ['PELITA', 'Pelita Air', 16700, 135]]],
  ['Jabo', 'CGK', 'Padang', 16900, [['SILI', 'Citilink CGK', 15200, 70], ['ESP', 'Citilink CGK', 14900, 260]]],
  ['Jabo', 'CGK', 'Palangka Raya', 18400, [['SILI', 'Garuda Air CGK', 16700, 25], ['PRIME', 'Garuda Air CGK', 16300, 230]]],
  ['Jabo', 'CGK', 'Pekanbaru', 16100, [['SILI', 'Citilink CGK', 14600, 240], ['ESP', 'Pelita Air', 14100, 135], ['PELITA', 'Pelita Air', 14300, 105]]],
  ['Jabo', 'CGK', 'Tanjung Pandan', 15400, [['SILI', 'Citilink CGK', 14200, 10], ['ESP', 'Citilink CGK', 13900, 165]]],
  ['Jabo', 'CGK', 'Tanjung Pinang', 16800, [['PRIME', 'Garuda Air CGK', 14900, 200], ['SILI', 'Citilink CGK', 15200, 10]]],
  ['Surabaya', 'SUB', 'Balikpapan', 15200, [['SILI', 'Citilink CGK', 13600, 200], ['ESP', 'Citilink CGK', 13300, 120]]],
  ['Surabaya', 'SUB', 'Banjarmasin', 13800, [['SILI', 'Citilink CGK', 12300, 185], ['PELITA', 'Pelita Air', 12000, 120]]],
  ['Surabaya', 'SUB', 'Batam', 17300, [['SILI', 'Citilink CGK', 15700, 190], ['PRIME', 'Garuda Air CGK', 16200, 50]]],
]

export const FIXTURE_CYCLES = [
  '2026-03-1H', '2026-03-2H', '2026-04-1H', '2026-04-2H', '2026-05-1H', '2026-05-2H',
  '2026-06-1H', '2026-06-2H', '2026-07-1H', '2026-07-2H', '2026-08-1H', '2026-08-2H',
]

const seedRoute = (origin: string, dest: string) => {
  const r = SEED_ROUTES.find((x) => x[0] === origin && x[2] === dest)!
  return { origin: r[0], originLabel: r[1], dest: r[2] }
}

// Rows match the prototype's buildHistory() 1:1 (weight, revenue, cost) and fill every lane-cost
// field from `cost`, so on this fixture the SMU and all-in bases agree and both reproduce the
// prototype's cost/kg exactly. rateSpx carries the prototype's rate with pph2 = disc15 = 0, so the
// engine's net default rate equals the prototype's rate.
export function fixtureSource(): SimulationSource {
  const history: SimulationHistoryRow[] = []
  for (const [origin, , dest, rate, lanes] of SEED_ROUTES) {
    for (const [vendor, airline, costPerKg, loadKg] of lanes) {
      for (const cycle of FIXTURE_CYCLES) {
        const r1 = rand01(hashSeed([origin, dest, vendor, airline, cycle].join(':')))
        const r2 = rand01(hashSeed([cycle, airline, vendor, dest].join(':')))
        if (r1 < 0.1) continue
        const weight = Math.round(loadKg * 15 * (0.55 + 0.35 * r1))
        const revenue = Math.round(weight * rate * (0.98 + 0.04 * r1))
        const cost = Math.round(weight * costPerKg * (0.97 + 0.06 * r2))
        history.push({
          cycle, origin, dest, vendor, airline, awbCount: 1, weight, revenue,
          costAll: cost, costSmu: cost,
          laneWeightAll: weight, laneCostAll: cost, laneWeightSmu: weight, laneCostSmu: cost,
        })
      }
    }
  }
  return {
    basis: 'date',
    cycles: FIXTURE_CYCLES,
    routes: SEED_ROUTES.map(([origin, originLabel, dest, rate]) => ({
      origin, originLabel, dest, rateSpx: rate, pph2: 0, disc15: 0, hasData: true,
    })),
    routeGroups: [
      { id: 'grp-sumatera', name: 'Sumatera', description: null, routes: ['Aceh', 'Batam', 'Padang', 'Pekanbaru'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-kalimantan', name: 'Kalimantan', description: null, routes: ['Balikpapan', 'Banjarmasin', 'Palangka Raya'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-timur', name: 'Sulawesi & Timur', description: null, routes: ['Ambon', 'Denpasar', 'Kendari', 'Makassar'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-sub', name: 'Ex Surabaya', description: null, routes: ['Balikpapan', 'Banjarmasin', 'Batam'].map((d) => seedRoute('Surabaya', d)) },
      { id: 'grp-prioritas', name: 'Prioritas', description: null, routes: [seedRoute('Jabo', 'Makassar'), seedRoute('Jabo', 'Balikpapan'), seedRoute('Surabaya', 'Balikpapan')] },
    ],
    vendors: ['AURI', 'ESP', 'PELITA', 'PRIME', 'SILI'].map((vendor) => ({ vendor, inMaster: true, hasData: vendor !== 'AURI' })),
    history,
  }
}

// The prototype's createState() accounts (lines 233–242), used by the parity test.
export const PROTOTYPE_ACCOUNTS = (() => {
  const tr = (id: string, label: string, amount: number, cofValue: number, cycleDays: number) => ({
    id, label, amount, cofType: 'percent' as const, cofValue, cofUnit: 'month' as const, cycleDays,
  })
  return [
    { id: 'SILI', name: 'SILI', isEsp: false, enabled: true, tranches: [tr('SILI-1', 'Modal SILI', 1_200_000_000, 0.7, 30)] },
    { id: 'PRIME', name: 'PRIME', isEsp: false, enabled: true, tranches: [tr('PRIME-1', 'Modal PRIME', 800_000_000, 0.85, 60)] },
    { id: 'ESP', name: 'ESP', isEsp: true, enabled: true, tranches: [
      tr('ESP-1', 'Modal sendiri', 500_000_000, 0, 30),
      tr('ESP-2', 'Pinjaman bank', 400_000_000, 0.9, 30),
      tr('ESP-3', 'Dana investor', 300_000_000, 1.2, 60),
    ] },
    { id: 'PELITA', name: 'PELITA', isEsp: false, enabled: true, tranches: [tr('PELITA-1', 'Modal PELITA', 300_000_000, 0.8, 30)] },
  ]
})()
