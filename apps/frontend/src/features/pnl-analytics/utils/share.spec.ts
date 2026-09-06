import { airlineShare, buildShare, selfOperateGap, shareTable, vendorExecution } from './share'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'

describe('buildShare', () => {
  it('ranks by weight but sorts the unattributed bucket last', () => {
    const { rows, attributedPct } = buildShare([
      { name: '—', weight: 500, cost: 5000 },
      { name: 'Lion', weight: 300, cost: 2400 },
      { name: 'Garuda', weight: 200, cost: 2000 },
    ])
    // The unattributed bucket is the heaviest, and still must not head the ranking.
    expect(rows.map((r) => r.name)).toEqual(['Lion', 'Garuda', '—'])
    expect(rows[0]).toMatchObject({ costPerKg: 8, attributed: true })
    expect(rows[0].weightPct).toBeCloseTo(30, 6)
    expect(attributedPct).toBeCloseTo(50, 6)
  })

  it('is empty rather than NaN-filled for no entries', () => {
    expect(buildShare([])).toEqual({ rows: [], attributedPct: 0 })
  })
})

describe('shareTable', () => {
  it('reads any endpoint row shape through its name field', () => {
    const { rows } = shareTable(
      [
        { name: 'RA Alpha', totalWeight: 100, totalCost: 900 },
        { name: 'RA Beta', totalWeight: 400, totalCost: 2000 },
      ],
      'name',
    )
    expect(rows.map((r) => r.name)).toEqual(['RA Beta', 'RA Alpha'])
    expect(rows[1].costPerKg).toBe(9)
  })
})

const vendors: PnlVendorCostItem[] = [
  {
    vendor: 'ESP',
    totalWeight: 1000,
    totalCost: 8000,
    airlines: [
      { airline: 'Lion', totalWeight: 600, totalCost: 4800 }, // 8/kg
      { airline: 'Garuda', totalWeight: 0, totalCost: 0 }, // no usable baseline
    ],
  },
  {
    vendor: 'PT Maju',
    totalWeight: 500,
    totalCost: 5500,
    airlines: [
      { airline: 'Lion', totalWeight: 400, totalCost: 4400 }, // 11/kg
      { airline: 'Garuda', totalWeight: 100, totalCost: 1100 },
    ],
  },
  {
    vendor: '—',
    totalWeight: 200,
    totalCost: 2200,
    airlines: [{ airline: 'Lion', totalWeight: 200, totalCost: 2200 }],
  },
]

describe('vendorExecution', () => {
  it('ranks vendors by tonnage with the unattributed bucket last', () => {
    expect(vendorExecution(vendors).rows.map((r) => r.name)).toEqual(['ESP', 'PT Maju', '—'])
  })
})

describe('airlineShare', () => {
  it('sums each airline across every vendor that flew it', () => {
    const { rows } = airlineShare(vendors)
    const lion = rows.find((r) => r.name === 'Lion')!
    expect(lion.weight).toBe(1200)
    expect(lion.cost).toBe(11400)
  })
})

describe('selfOperateGap', () => {
  it('prices third-party tonnage against ESP on the same airline', () => {
    const { rows, totalImpact, totalCapital } = selfOperateGap(vendors)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      vendor: 'PT Maju',
      airline: 'Lion',
      vendorWeight: 400,
      vendorCostPerKg: 11,
      espCostPerKg: 8,
      gapPerKg: 3,
      impact: 1200,
      capitalNeeded: 3200,
    })
    expect(totalImpact).toBe(1200)
    expect(totalCapital).toBe(3200)
  })

  it('skips a zero-weight ESP row rather than treating free flying as the baseline', () => {
    // PT Maju also flies Garuda, but ESP's Garuda row carries no tonnage, so its cost per kg is
    // not a real rate. Comparing against it would report a fabricated saving.
    expect(selfOperateGap(vendors).rows.some((r) => r.airline === 'Garuda')).toBe(false)
  })

  it('never compares ESP or the unattributed bucket against ESP', () => {
    const rows = selfOperateGap(vendors).rows
    expect(rows.some((r) => r.vendor === 'ESP' || r.vendor === '—')).toBe(false)
  })
})

describe('selfOperateGap ordering', () => {
  const twoThirdParties: PnlVendorCostItem[] = [
    {
      vendor: 'ESP',
      totalWeight: 600,
      totalCost: 4800,
      airlines: [{ airline: 'Lion', totalWeight: 600, totalCost: 4800 }], // 8/kg baseline
    },
    {
      vendor: 'PT Kecil',
      totalWeight: 100,
      totalCost: 1000,
      airlines: [{ airline: 'Lion', totalWeight: 100, totalCost: 1000 }], // 10/kg, impact 200
    },
    {
      vendor: 'PT Maju',
      totalWeight: 400,
      totalCost: 4400,
      airlines: [{ airline: 'Lion', totalWeight: 400, totalCost: 4400 }], // 11/kg, impact 1200
    },
  ]

  it('puts the biggest impact first, so the UI leads with the costliest gap', () => {
    const { rows } = selfOperateGap(twoThirdParties)
    expect(rows.map((r) => r.vendor)).toEqual(['PT Maju', 'PT Kecil'])
    expect(rows.map((r) => r.impact)).toEqual([1200, 200])
  })
})

describe('buildShare cost share', () => {
  it('takes cost share against total cost, not total weight', () => {
    // Equal tonnage, unequal spend: weight share and cost share must diverge, which they cannot
    // do if costPct is divided by the weight total.
    const { rows } = buildShare([
      { name: 'Cheap', weight: 100, cost: 250 },
      { name: 'Pricey', weight: 100, cost: 750 },
    ])
    const cheap = rows.find((r) => r.name === 'Cheap')!
    const pricey = rows.find((r) => r.name === 'Pricey')!
    expect(cheap.weightPct).toBeCloseTo(50, 6)
    expect(pricey.weightPct).toBeCloseTo(50, 6)
    expect(cheap.costPct).toBeCloseTo(25, 6)
    expect(pricey.costPct).toBeCloseTo(75, 6)
  })
})
