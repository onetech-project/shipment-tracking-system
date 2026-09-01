/**
 * Every revenue figure the dashboard SHOWS is net of revenue_discount.
 *
 * v_pnl_to deliberately stores revenue gross and carries pph_2 + disc_15 alongside it in
 * revenue_discount (see 20260829000001-pnl-rate-spx-revenue): margin is computed downstream as
 * revenue_total - revenue_discount - cost_to, so the netting was never missing from the numbers —
 * only from what the user reads. Est. Revenue, the AWB drilldown's Revenue column and both
 * comparison tabs showed the gross figure, so Revenue - Cost did not equal Margin and the
 * difference was the discount. These tests pin the display side: revenue out of the service is
 * net, and every marginPct divides by that same net revenue rather than the gross one.
 *
 * The view is untouched — this is presentation only. revenue_discount still exists, is still
 * summed, and is still surfaced as totalDiscount for the breakdown that wants to show it.
 */

import { PnlService } from './pnl.service'
import { DataSource } from 'typeorm'

describe('P&L net revenue display', () => {
  let service: PnlService
  let dataSource: { query: jest.Mock }

  beforeEach(() => {
    dataSource = { query: jest.fn() }
    service = new PnlService(dataSource as unknown as DataSource)
  })

  describe('getSummary', () => {
    it('reports revenue net of discount, and margin pct over that net revenue', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total_tos: '100',
          total_awbs: '10',
          total_revenue: '5000000',
          total_discount: '175000', // 3.5% = 2% pph_2 + 1.5% disc_15
          total_cost: '4000000',
        },
      ])

      const result = await service.getSummary('2026-04-2H')

      // Net revenue is what the KPI card shows: 5,000,000 − 175,000.
      expect(result.totalRevenue).toBe(4_825_000)
      // The gross figure stays available; nothing downstream loses access to it.
      expect(result.totalRevenueGross).toBe(5_000_000)
      expect(result.totalDiscount).toBe(175_000)
      // Gross profit is unchanged — it always netted the discount.
      expect(result.grossProfit).toBe(825_000)
      // Margin pct now divides by net revenue, so Revenue − Cost === Gross Profit on screen.
      expect(result.totalRevenue - result.totalCost).toBe(result.grossProfit)
      expect(result.grossMarginPct).toBeCloseTo((825_000 / 4_825_000) * 100, 10)
    })

    it('leaves margin pct null-safe when net revenue is zero', async () => {
      dataSource.query.mockResolvedValueOnce([
        { total_tos: '0', total_awbs: '0', total_revenue: '0', total_discount: '0', total_cost: '0' },
      ])

      const result = await service.getSummary('2026-04-2H')

      expect(result.totalRevenue).toBe(0)
      expect(result.grossMarginPct).toBe(0)
    })
  })

  describe('getDailyMargin', () => {
    it('nets the discount out of each day and divides margin pct by net revenue', async () => {
      dataSource.query.mockResolvedValueOnce([
        { date: '2026-05-01', revenue: '1000', discount: '35', cost: '600', has_incomplete_cost: false },
      ])

      const [day] = await service.getDailyMargin('2026-05-1H')

      expect(day.revenue).toBe(965)
      // 1000 − 35 − 600 = 365, over net revenue 965.
      expect(day.marginPct).toBeCloseTo((365 / 965) * 100, 10)
      expect(day.revenue - day.cost).toBeCloseTo(365, 10)
    })
  })

  describe('getProfitByRoute', () => {
    it('reports route revenue net, so revenue − cost reconciles with margin', async () => {
      dataSource.query.mockResolvedValueOnce([
        { route: 'CGK → TNJ', total_revenue: '1000', total_discount: '35', total_weight: '100', total_cost: '600' },
      ])

      const [row] = await service.getProfitByRoute('2026-05-1H')

      expect(row.totalRevenue).toBe(965)
      expect(row.totalMargin).toBe(365)
    })
  })

  describe('getRevenueByRoute', () => {
    it('nets the discount out of the revenue breakdown', async () => {
      dataSource.query.mockResolvedValueOnce([
        { route: 'CGK → TNJ', total_weight: '100', total_revenue: '1000', total_discount: '35' },
      ])

      const [row] = await service.getRevenueByRoute('2026-05-1H')

      expect(row.totalRevenue).toBe(965)
    })
  })
})
