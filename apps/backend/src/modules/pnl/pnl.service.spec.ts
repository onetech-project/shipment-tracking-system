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
        total_cost: '4000000',
        gross_profit: '1000000',
      }])

      const result = await service.getSummary('2026-04-2H')

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v_pnl_to'),
        ['2026-04-2H'],
      )
      expect(result).toEqual({
        label: '2026-04-2H',
        totalTos: 100,
        totalAwbs: 10,
        totalRevenue: 5000000,
        totalCost: 4000000,
        grossProfit: 1000000,
        grossMarginPct: 20,
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
  })
})
