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

    // The route filter picks which AWBs appear; it must never shrink the set of TOs aggregated for
    // a chosen AWB, because cost columns are MAX(cost_*_awb) over the whole AWB.
    function mockEmptyPage() {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])
    }

    it('assembles no EXISTS clause when no route field is given', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).not.toContain('EXISTS')
      expect(params).toEqual(['2026-04-2H', 50, 0])
      const [countSql, countParams] = dataSource.query.mock.calls[1]
      expect(countSql).not.toContain('EXISTS')
      expect(countParams).toEqual(['2026-04-2H'])
    })

    it('filters by origin through an EXISTS semi-join on the same AWB', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        origin: 'Jabo',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      // Pin the full head, not just a substring, so a mutation to `NOT EXISTS` is caught.
      expect(sql).toContain('AND EXISTS (')
      expect(sql).not.toContain('NOT EXISTS')
      expect(sql).toContain('m.awb = v.awb')
      expect(sql).toContain('m.origin_station = $2')
      // The period filter is re-applied inside the subquery, reusing $1 rather than rebinding it.
      expect(sql).toContain('m.cycle_ata = $1')
      // The outer filter runs against the aliased view, not the bare v_pnl_to columns.
      expect(sql).toContain('v.cycle_ata = $1')
      expect(params).toEqual(['2026-04-2H', 'Jabo', 50, 0])
    })

    it('filters by destination and date range together, ending exclusive on the next day', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        dest: 'Tanjung Pinang',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('m.dest_station = $2')
      expect(sql).toContain('m.date_ata >= $3::DATE')
      expect(sql).toContain("m.date_ata < ($4::DATE + INTERVAL '1 day')")
      expect(params).toEqual(['2026-04-2H', 'Tanjung Pinang', '2026-05-01', '2026-05-01', 50, 0])
    })

    it('binds route params after the range-mode offset in custom-date-range mode', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, undefined, '2026-05-01', '2026-05-31', undefined, {
        origin: 'Jabo',
        dest: 'Aceh',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      // Range mode binds two params ($1, $2) for the outer filter before any route params, so the
      // route conditions must land at $3/$4, not $2/$3 (which the cycle-mode-only offset would give).
      expect(sql).toContain('m.origin_station = $3')
      expect(sql).toContain('m.dest_station = $4')
      expect(sql).toContain('LIMIT $5 OFFSET $6')
      expect(params).toEqual(['2026-05-01', '2026-05-31', 'Jabo', 'Aceh', 50, 0])
    })

    it('uses the date column of the selected basis inside the subquery', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'atd_origin', {
        dateFrom: '2026-05-01',
      })
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('m.date_atd >= $2::DATE')
    })

    it('applies the identical WHERE clause to the count query so paging matches', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(2, 50, '2026-04-2H', undefined, undefined, undefined, {
        origin: 'Jabo',
      })
      const [countSql, countParams] = dataSource.query.mock.calls[1]
      expect(countSql).toContain('COUNT(DISTINCT awb)')
      expect(countSql).toContain('m.origin_station = $2')
      // No LIMIT/OFFSET params on the count query.
      expect(countParams).toEqual(['2026-04-2H', 'Jabo'])
    })

    it('reports the dominant origin, dest and date, flagging none as varying when uniform', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-4', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', sum_gw: '20', chwt: '25', total_revenue: '200', total_discount: '3',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '176', has_null_cost: false, issue_rank: null,
            origin: 'Jabo', dest: 'Tanjung Pinang', route_date: '2026-05-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].origin).toBe('Jabo')
      expect(data[0].dest).toBe('Tanjung Pinang')
      expect(data[0].date).toBe('2026-05-01')
      expect(data[0].originVaries).toBe(false)
      expect(data[0].destVaries).toBe(false)
      expect(data[0].dateVaries).toBe(false)
    })

    it('flags an AWB whose TOs disagree, accepting Postgres text booleans', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-5', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', sum_gw: '20', chwt: null, total_revenue: '200', total_discount: '3',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '176', has_null_cost: false, issue_rank: null,
            origin: 'Jabo', dest: 'Aceh', route_date: '2026-05-01',
            origin_varies: false, dest_varies: 't', date_varies: true,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].destVaries).toBe(true)
      expect(data[0].dateVaries).toBe(true)
      expect(data[0].originVaries).toBe(false)
    })

    it('maps a missing route or date to null rather than a blank string', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-6', vendor: null, airline: null,
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: null, cost_ra: null, cost_sg_out: null, cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '1',
            origin: null, dest: null, route_date: null,
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].origin).toBeNull()
      expect(data[0].dest).toBeNull()
      expect(data[0].date).toBeNull()
    })

    it('selects the dominant values with MODE against the basis date column', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'atd_origin')

      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('MODE() WITHIN GROUP (ORDER BY origin_station)')
      expect(sql).toContain('MODE() WITHIN GROUP (ORDER BY v.date_atd::DATE)')
      expect(sql).toContain('COUNT(DISTINCT v.date_atd::DATE) > 1')
      // Tie each expression to its alias, not just presence anywhere in the SQL, so a mutation
      // that swaps the origin/dest expressions (or compares a *_varies flag against the wrong
      // column) fails here even though the substrings above would still be found.
      const normalizedSql = sql.replace(/\s+/g, ' ')
      expect(normalizedSql).toContain('MODE() WITHIN GROUP (ORDER BY origin_station) AS origin')
      expect(normalizedSql).toContain('MODE() WITHIN GROUP (ORDER BY dest_station) AS dest')
      expect(normalizedSql).toContain('COUNT(DISTINCT origin_station) > 1 AS origin_varies')
      expect(normalizedSql).toContain('COUNT(DISTINCT dest_station) > 1 AS dest_varies')
      expect(normalizedSql).toContain('COUNT(DISTINCT v.date_atd::DATE) > 1 AS date_varies')
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

  describe('getStations', () => {
    it('labels known origins and falls back to the raw value for unknown ones', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin_station: 'Jabo', dest_station: 'Aceh' },
        { origin_station: 'Surabaya', dest_station: 'Pontianak' },
        { origin_station: 'Medan', dest_station: 'Batam' },
      ])

      const result = await service.getStations()

      expect(result).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
        { origin: 'Medan', originLabel: 'Medan', dest: 'Batam' },
      ])
    })

    it('reads the whole view rather than a period', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getStations()
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('SELECT DISTINCT origin_station, dest_station')
      expect(sql).not.toContain('cycle_ata')
      expect(params).toBeUndefined()
    })
  })

  describe('getDailyMatrix', () => {
    // Two Jabo destinations and one Surabaya destination; facts cover only some (date, route) pairs.
    const columnRows = [
      { origin_station: 'Jabo', dest_station: 'Aceh' },
      { origin_station: 'Jabo', dest_station: 'Ambon' },
      { origin_station: 'Surabaya', dest_station: 'Pontianak' },
    ]

    function mockQueries(factRows: Record<string, string>[]) {
      dataSource.query
        .mockResolvedValueOnce(columnRows)
        .mockResolvedValueOnce(factRows)
    }

    it('labels Jabo as CGK and Surabaya as SUB, preserving query order', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.columns).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Ambon' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
      ])
    })

    it('emits one row per calendar day, including days with no shipments', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows).toHaveLength(15)
      expect(result.periodDays).toBe(15)
      expect(result.rows[0].date).toBe('2026-07-01')
      expect(result.rows[14].date).toBe('2026-07-15')
      expect(result.rows[0].cells).toEqual([null, null, null])
    })

    it('places each fact in the cell matching its column index', async () => {
      mockQueries([
        { d: '2026-07-02', origin_station: 'Surabaya', dest_station: 'Pontianak',
          revenue: '300', margin: '30', weight: '3', incomplete_tos: '0' },
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Ambon',
          revenue: '200', margin: '20', weight: '2', incomplete_tos: '1' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')

      expect(result.rows[0].cells[0]).toBeNull()
      expect(result.rows[0].cells[1]).toEqual({ revenue: 200, margin: 20, weight: 2, incompleteTos: 1 })
      expect(result.rows[0].cells[2]).toBeNull()
      expect(result.rows[1].cells[2]).toEqual({ revenue: 300, margin: 30, weight: 3, incompleteTos: 0 })
    })

    it('distinguishes a zero-valued cell from an absent one', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '0', margin: '0', weight: '0', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows[0].cells[0]).toEqual({ revenue: 0, margin: 0, weight: 0, incompleteTos: 0 })
      expect(result.rows[0].cells[1]).toBeNull()
    })

    it('computes footer totals, averages, margin pct and space per kg per column', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '600', margin: '60', weight: '10', incomplete_tos: '1' },
        { d: '2026-07-02', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '400', margin: '40', weight: '10', incomplete_tos: '2' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')

      expect(result.footer[0]).toEqual({
        totalRevenue: 1000,
        totalMargin: 100,
        totalWeight: 20,
        avgRevenuePerDay: 1000 / 15,
        avgMarginPerDay: 100 / 15,
        marginPct: 10,      // 100 / 1000 × 100
        spacePerKg: 5,      // 100 / 20
        incompleteTos: 3,
      })
    })

    it('returns null rather than Infinity or NaN when a divisor is zero', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '0', margin: '-50', weight: '0', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.footer[0].marginPct).toBeNull()
      expect(result.footer[0].spacePerKg).toBeNull()
      expect(result.footer[0].totalMargin).toBe(-50)
    })

    it('keeps a column with no data at all, with zeroed footer', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.footer).toHaveLength(3)
      expect(result.footer[2]).toEqual({
        totalRevenue: 0, totalMargin: 0, totalWeight: 0,
        avgRevenuePerDay: 0, avgMarginPerDay: 0,
        marginPct: null, spacePerKg: null, incompleteTos: 0,
      })
    })

    it('ignores a fact whose route is not among the columns', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Nowhere',
          revenue: '999', margin: '999', weight: '9', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows[0].cells).toEqual([null, null, null])
      expect(result.footer[0].totalRevenue).toBe(0)
    })

    it('ignores a fact whose date falls outside the calendar rows', async () => {
      mockQueries([
        { d: '2026-07-20', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '999', margin: '999', weight: '9', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows.every((r) => r.cells.every((c) => c === null))).toBe(true)
    })

    it('selects the date as text and filters on the chosen basis in range mode', async () => {
      mockQueries([])
      await service.getDailyMatrix(undefined, '2026-07-01', '2026-07-03', 'atd_origin')

      const [factSql, factParams] = dataSource.query.mock.calls[1]
      expect(factSql).toContain("TO_CHAR(date_atd::DATE, 'YYYY-MM-DD')")
      expect(factSql).toContain('cost_to IS NULL')
      expect(factSql).toContain('COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)')
      expect(factSql).toContain('- COALESCE(SUM(cost_to), 0)')
      expect(factParams).toEqual(['2026-07-01', '2026-07-03'])
    })

    it('reads the column list independently of the period filter', async () => {
      mockQueries([])
      await service.getDailyMatrix('2026-07-1H')

      const [columnSql, columnParams] = dataSource.query.mock.calls[0]
      expect(columnSql).toContain('SELECT DISTINCT origin_station, dest_station')
      expect(columnParams).toBeUndefined()
    })
  })
})
