import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import * as XLSX from 'xlsx'
import { PnlSettlementService } from './pnl-settlement.service'

function detailWorkbook(rows: Array<{ lt: string; to: string; amount: number }>): Buffer {
  const aoa: unknown[][] = [
    ['Recap'],
    ['PT'],
    ['Period'],
    ['Date', 'LT Number', 'TO Number', 'Amount'],
    ...rows.map((r) => ['46067', r.lt, r.to, r.amount]),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Origin')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('PnlSettlementService', () => {
  let service: PnlSettlementService
  let dataSource: { query: jest.Mock; transaction: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn(), transaction: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [PnlSettlementService, { provide: DataSource, useValue: dataSource }],
    }).compile()
    service = module.get(PnlSettlementService)
  })

  describe('getSummary', () => {
    it('computes coverage and revenue variance against the settled subset', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total_tos: '10',
          settled_tos: '4',
          est_revenue: '1000',
          est_revenue_settled: '400',
          act_revenue: '450',
        },
      ])
      const r = await service.getSummary('2026-03-1H')
      expect(r.coveragePct).toBe(40)
      expect(r.estRevenue).toBe(1000)
      expect(r.estRevenueSettled).toBe(400)
      expect(r.actRevenue).toBe(450)
      expect(r.varRevenue).toBe(50)
      expect(r.varRevenuePct).toBeCloseTo(12.5)
    })

    it('returns null variance % when settled estimate is zero', async () => {
      dataSource.query.mockResolvedValueOnce([
        { total_tos: '0', settled_tos: '0', est_revenue: '0', est_revenue_settled: '0', act_revenue: '0' },
      ])
      const r = await service.getSummary(undefined, '2026-03-01', '2026-03-15')
      expect(r.coveragePct).toBe(0)
      expect(r.varRevenuePct).toBeNull()
    })
  })

  describe('getToComparison', () => {
    it('maps rows and derives per-row variance %', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            to_number: 'TO1',
            lt_number: 'LT1',
            awb: 'A1',
            origin_station: 'CGK',
            dest_station: 'DPS',
            est_revenue: '100',
            act_revenue: '120',
            var_revenue: '20',
            is_settled: true,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])
      const { data, total } = await service.getToComparison(1, 50, '2026-03-1H')
      expect(total).toBe(1)
      expect(data[0]).toMatchObject({
        toNumber: 'TO1',
        estRevenue: 100,
        actRevenue: 120,
        varRevenue: 20,
        isSettled: true,
      })
      expect(data[0].varRevenuePct).toBeCloseTo(20)
    })
  })

  describe('commit', () => {
    it('updates by (lt,to) in a transaction and refreshes the materialized view', async () => {
      // transaction(cb) → run cb with a manager whose UPDATE returns rowCount.
      const manager = { query: jest.fn().mockResolvedValue([[], 2]) }
      dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<void>) => cb(manager))
      dataSource.query.mockResolvedValue(undefined) // the REFRESH call

      const buf = detailWorkbook([
        { lt: 'LT1', to: 'TO1', amount: 100 },
        { lt: 'LT2', to: 'TO2', amount: 200 },
      ])
      const res = await service.commit(buf)

      expect(res.updated).toBe(2)
      expect(res.totalParsed).toBe(2)
      // UPDATE targets the fact table by the (lt,to) unique key.
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE air_shipments_compileaircgk'),
        expect.arrayContaining(['LT1', 'TO1', 100, 'LT2', 'TO2', 200]),
      )
      // View refresh runs once after the transaction.
      expect(dataSource.query).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to',
      )
    })
  })

  describe('preview', () => {
    it('counts matched vs unmatched against existing fact rows', async () => {
      // matchedKeySet: one chunk query returns only LT1/TO1 as existing.
      dataSource.query.mockResolvedValueOnce([{ lt: 'LT1', to_num: 'TO1' }])
      const buf = detailWorkbook([
        { lt: 'LT1', to: 'TO1', amount: 100 },
        { lt: 'LT2', to: 'TO2', amount: 200 }, // not in fact table
      ])
      const res = await service.preview(buf)
      expect(res.totalParsed).toBe(2)
      expect(res.matched).toBe(1)
      expect(res.unmatched).toBe(1)
      expect(res.unmatchedSample).toEqual([{ ltNumber: 'LT2', toNumber: 'TO2' }])
    })
  })
})
