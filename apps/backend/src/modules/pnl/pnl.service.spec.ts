import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { PnlService } from './pnl.service'

describe('PnlService', () => {
  let service: PnlService
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        PnlService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile()
    service = module.get(PnlService)
  })

  describe('getSummary', () => {
    it('returns aggregated P&L for a cycle', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '100',
        total_awbs: '10',
        total_revenue: '5000000',
        total_discount: '75000',
        total_cost: '4000000',
      }])

      const result = await service.getSummary('2026-04-2H')

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v_pnl_to'),
        ['2026-04-2H'],
      )
      // Gross profit nets the 1.5% discount: 5,000,000 − 75,000 − 4,000,000 = 925,000
      expect(result).toEqual({
        label: '2026-04-2H',
        totalTos: 100,
        totalAwbs: 10,
        totalRevenue: 5000000,
        totalDiscount: 75000,
        totalCost: 4000000,
        grossProfit: 925000,
        grossMarginPct: 18.5,
      })
    })
  })

  describe('getCycles', () => {
    it('returns distinct cycle periods ordered desc', async () => {
      dataSource.query.mockResolvedValueOnce([
        { cycle_period: '2026-04-2H' },
        { cycle_period: '2026-04-1H' },
      ])

      const result = await service.getCycles()
      expect(result).toEqual(['2026-04-2H', '2026-04-1H'])
    })

    it('defaults to the ata cycle column', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getCycles()
      expect(dataSource.query.mock.calls[0][0]).toContain('cycle_ata')
    })

    it('uses the atd cycle column when basis=atd_origin', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getCycles('atd_origin')
      expect(dataSource.query.mock.calls[0][0]).toContain('cycle_atd')
    })
  })

  describe('date basis filtering', () => {
    it('getSummary filters on the basis cycle column (cycle mode)', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '1', total_awbs: '1', total_revenue: '0', total_discount: '0', total_cost: '0',
      }])
      await service.getSummary('2026-05-1H', undefined, undefined, 'completed_time')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('cycle_completed = $1')
      expect(params).toEqual(['2026-05-1H'])
    })

    it('getSummary range mode filters on the basis date column', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '0', total_awbs: '0', total_revenue: '0', total_discount: '0', total_cost: '0',
      }])
      await service.getSummary(undefined, '2026-05-01', '2026-05-15', 'atd_origin')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('date_atd')
      expect(params).toEqual(['2026-05-01', '2026-05-15'])
    })

    it('falls back to the ata date column for an unknown basis', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '0', total_awbs: '0', total_revenue: '0', total_discount: '0', total_cost: '0',
      }])
      await service.getSummary(undefined, '2026-05-01', '2026-05-15', 'bogus')
      expect(dataSource.query.mock.calls[0][0]).toContain('date_ata')
    })
  })

  describe('getProfitByRoute', () => {
    it('computes margin as revenue − discount − cost (reconciles with the KPI)', async () => {
      dataSource.query.mockResolvedValueOnce([
        { route: 'CGK → TNJ', total_revenue: '1000', total_discount: '15', total_weight: '100', total_cost: '600' },
      ])

      const result = await service.getProfitByRoute('2026-05-1H')

      // 1000 − 15 − 600 = 385 (NOT SUM(gross_profit_to))
      expect(result[0].totalMargin).toBe(385)
      expect(result[0].totalRevenue).toBe(1000)
      expect(result[0].avgMarginPerKg).toBeCloseTo(3.85)
    })
  })

  describe('getDataQuality', () => {
    it('paginates server-side and returns total', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ awb: '888-1', issue: 'no_booking', to_number: 'TO-1' }])
        .mockResolvedValueOnce([{ total: '42' }])

      const result = await service.getDataQuality(2, 25)

      expect(dataSource.query.mock.calls[0][1]).toEqual([25, 25]) // limit, offset (page 2)
      expect(result.total).toBe(42)
      expect(result.data[0]).toEqual({ toNumber: 'TO-1', awb: '888-1', issue: 'no_booking' })
    })
  })

  describe('getDataQualitySummary', () => {
    it('returns row/awb counts per costing-failure reason', async () => {
      dataSource.query.mockResolvedValueOnce([
        { issue: 'no_booking', rows: '5361', awbs: '223' },
        { issue: 'smu_rate_missing', rows: '2142', awbs: '108' },
      ])

      const result = await service.getDataQualitySummary()

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE issue IS NOT NULL'),
      )
      expect(result).toEqual([
        { issue: 'no_booking', rows: 5361, awbs: 223 },
        { issue: 'smu_rate_missing', rows: 2142, awbs: 108 },
      ])
    })
  })

  describe('getAwbDrilldown', () => {
    it('maps the aggregated issue_rank back to the most-severe reason', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-1', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '3', sum_gw: '100', total_revenue: '1000', total_discount: '15',
            cost_smu: null, cost_ra: '200', cost_sg_out: '300', cost_sg_in: '50',
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '2',
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50)

      // issue_rank 2 -> 'smu_rate_missing'
      expect(data[0].issue).toBe('smu_rate_missing')
      expect(data[0].hasNullCost).toBe(true)
    })

    it('reports no issue when fully costed (issue_rank null)', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-2', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: '12.5', total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '77.5', has_null_cost: false, issue_rank: null,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50)
      expect(data[0].issue).toBeNull()
      expect(data[0].chwt).toBe(12.5)
    })

    it('maps chwt as null when the AWB has no chargeable weight', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-3', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '77.5', has_null_cost: false, issue_rank: null,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50)
      expect(data[0].chwt).toBeNull()
    })
  })

  describe('getAwbTos', () => {
    it('passes through the per-TO issue reason', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          to_number: 'TO-1', gross_weight: '10', chwt: '7.5', revenue_total: '100',
          cost_smu: null, cost_ra: '5', cost_sg: '5', cost_sg_in: '1',
          cost_to: null, gross_profit_to: null, margin_pct: null, issue: 'smu_rate_missing',
        },
      ])

      const result = await service.getAwbTos('888-1', '2026-04-2H')
      expect(result[0].issue).toBe('smu_rate_missing')
      expect(result[0].costSmu).toBeNull()
      // Per-TO chwt = proportional allocation (chwt_awb × weight_share), computed in SQL.
      expect(result[0].chwt).toBe(7.5)
    })
  })
})
