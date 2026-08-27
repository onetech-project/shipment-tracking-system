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

  describe('getStations', () => {
    it('orders by origin then destination so contiguous rows share an origin', async () => {
      // groupOrigins (frontend dailyMatrix.ts) builds the Daily Report's origin header spans by
      // merging CONSECUTIVE rows that share an origin label. Without this ORDER BY, station pairs
      // for the same origin can come back interleaved and the header spans fracture silently.
      dataSource.query.mockResolvedValueOnce([])
      await service.getStations()
      const sql = dataSource.query.mock.calls[0][0]
      expect(sql).toContain('ORDER BY 1, 2')
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

    it('filters by a route pair through an EXISTS semi-join on the same AWB', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      // Pin the full head, not just a substring, so a mutation to `NOT EXISTS` is caught.
      expect(sql).toContain('AND EXISTS (')
      expect(sql).not.toContain('NOT EXISTS')
      expect(sql).toContain('m.awb = v.awb')
      expect(sql).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      // The period filter is re-applied inside the subquery, reusing $1 rather than rebinding it.
      expect(sql).toContain('m.cycle_ata = $1')
      // The outer filter runs against the aliased view, not the bare v_pnl_to columns.
      expect(sql).toContain('v.cycle_ata = $1')
      expect(params).toEqual(['2026-04-2H', ['Jabo'], ['Aceh'], 50, 0])
    })

    it('filters by route and date range together, ending exclusive on the next day', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Tanjung Pinang' }],
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      expect(sql).toContain('m.date_ata >= $4::DATE')
      expect(sql).toContain("m.date_ata < ($5::DATE + INTERVAL '1 day')")
      expect(params).toEqual([
        '2026-04-2H',
        ['Jabo'],
        ['Tanjung Pinang'],
        '2026-05-01',
        '2026-05-01',
        50,
        0,
      ])
    })

    it('binds route params after the range-mode offset in custom-date-range mode', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, undefined, '2026-05-01', '2026-05-31', undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      // Range mode binds two params ($1, $2) for the outer filter before any route params, so the
      // route conditions must land at $3/$4, not $2/$3 (which the cycle-mode-only offset would give).
      expect(sql).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($3::text[], $4::text[]))',
      )
      expect(sql).toContain('LIMIT $5 OFFSET $6')
      expect(params).toEqual(['2026-05-01', '2026-05-31', ['Jabo'], ['Aceh'], 50, 0])
    })

    it('matches any of the selected route pairs with a single UNNEST condition', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Pontianak' },
        ],
      })

      const [sql, params] = dataSource.query.mock.calls[0]
      const normalized = (sql as string).replace(/\s+/g, ' ')
      expect(normalized).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      // Two parallel arrays, not an interleaved list: a flattened list would silently pair
      // Denpasar with Surabaya.
      expect(params).toEqual([
        '2026-04-2H',
        ['Jabo', 'Surabaya'],
        ['Denpasar', 'Pontianak'],
        50,
        0,
      ])
    })

    it('still narrows AWBs by EXISTS so cost stays whole-AWB', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })

      const normalized = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(normalized).toContain('AND EXISTS ( SELECT 1 FROM v_pnl_to m WHERE m.awb = v.awb')
    })

    it('filters by vendor in the outer predicate, not inside the route EXISTS', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
        vendors: ['ESP', 'Angkasa'],
      })

      const dataSql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      // The outer alias is `v`. Inside the EXISTS the alias is `m`, and a vendor predicate there
      // would only decide WHICH AWBs are listed while the outer aggregate still summed every
      // vendor's TOs — a third question nobody asked.
      expect(dataSql).toContain('AND v.vendor = ANY(')
      expect(dataSql).not.toContain('m.vendor')

      const dataParams = dataSource.query.mock.calls[0][1] as unknown[]
      expect(dataParams).toContain(dataParams.find((p) => Array.isArray(p) && p[0] === 'ESP'))
    })

    it('applies the same vendor predicate to the count query, so paging stays consistent', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        vendors: ['ESP'],
      })

      const countSql = (dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')
      expect(countSql).toContain('AND v.vendor = ANY(')
    })

    it('leaves the query untouched when no vendor is given', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      })

      const dataSql = dataSource.query.mock.calls[0][0] as string
      expect(dataSql).not.toContain('v.vendor = ANY')
    })

    it('emits no route condition at all when no routes are selected', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [],
      })

      expect(dataSource.query.mock.calls[0][0]).not.toContain('EXISTS')
      expect(dataSource.query.mock.calls[0][1]).toEqual(['2026-04-2H', 50, 0])
    })

    it('combines routes with the date window in one EXISTS', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
        dateFrom: '2026-04-20',
        dateTo: '2026-04-20',
      })

      const [, params] = dataSource.query.mock.calls[0]
      expect(params).toEqual([
        '2026-04-2H',
        ['Jabo'],
        ['Aceh'],
        '2026-04-20',
        '2026-04-20',
        50,
        0,
      ])
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
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })
      const [countSql, countParams] = dataSource.query.mock.calls[1]
      expect(countSql).toContain('COUNT(DISTINCT awb)')
      expect(countSql).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      // No LIMIT/OFFSET params on the count query.
      expect(countParams).toEqual(['2026-04-2H', ['Jabo'], ['Aceh']])
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
      expect(normalizedSql).toContain(
        "TO_CHAR(MODE() WITHIN GROUP (ORDER BY v.date_atd::DATE), 'YYYY-MM-DD') AS route_date",
      )
      expect(normalizedSql).toContain('COUNT(DISTINCT origin_station) > 1 AS origin_varies')
      expect(normalizedSql).toContain('COUNT(DISTINCT dest_station) > 1 AS dest_varies')
      expect(normalizedSql).toContain('COUNT(DISTINCT v.date_atd::DATE) > 1 AS date_varies')
    })

    it('maps issue_rank 6 to the station mapping gap and 7 to the SG In rate', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-7', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '6',
            origin: null, dest: null, route_date: '2026-06-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
          {
            awb: '888-8', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '7',
            origin: 'Jabo', dest: 'Aceh', route_date: '2026-06-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '2' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-06-1H')

      expect(data[0].issue).toBe('station_mapping_missing')
      expect(data[1].issue).toBe('sg_in_rate_missing')
    })

    it('ranks the station gap ahead of the SG In rate it causes', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-06-1H')

      const [sql] = dataSource.query.mock.calls[0]
      const normalized = sql.replace(/\s+/g, ' ')
      // A blank station is what breaks the SG Incoming join, so it must rank as the root cause.
      expect(normalized).toContain("WHEN 'station_mapping_missing' THEN 6")
      expect(normalized).toContain("WHEN 'sg_in_rate_missing' THEN 7")
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

  describe('getRoutes', () => {
    it('reads the DC-pair master, not the P&L view', async () => {
      // The Daily Report's route filter must be able to offer a route before its first shipment
      // ever lands, so it reads the master rather than the pairs v_pnl_to happens to carry.
      dataSource.query.mockResolvedValueOnce([])
      await service.getRoutes()
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('air_shipments_data')
      expect(sql).toContain("service = 'Air'")
      expect(sql).not.toContain('v_pnl_to')
      expect(params).toBeUndefined()
    })

    it('orders by origin then destination so contiguous rows share an origin', async () => {
      // Same reason getStations does: selectMatrixColumns inserts a picked-but-empty route next to
      // its origin's other columns, and groupOrigins merges only CONSECUTIVE same-origin columns.
      dataSource.query.mockResolvedValueOnce([])
      await service.getRoutes()
      expect(dataSource.query.mock.calls[0][0]).toContain('ORDER BY 1, 2')
    })

    it('labels known origins and falls back to the raw value for unknown ones', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Medan', dest: 'Batam' },
      ])

      const result = await service.getRoutes()

      expect(result).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Medan', originLabel: 'Medan', dest: 'Batam' },
      ])
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
        .mockResolvedValueOnce([])
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
      expect(result.rows[0].cells[1]).toEqual({ revenue: 200, margin: 20, weight: 2, incompleteTos: 1, issues: [] })
      expect(result.rows[0].cells[2]).toBeNull()
      expect(result.rows[1].cells[2]).toEqual({ revenue: 300, margin: 30, weight: 3, incompleteTos: 0, issues: [] })
    })

    it('distinguishes a zero-valued cell from an absent one', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '0', margin: '0', weight: '0', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows[0].cells[0]).toEqual({ revenue: 0, margin: 0, weight: 0, incompleteTos: 0, issues: [] })
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
        issues: [],
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
        marginPct: null, spacePerKg: null, incompleteTos: 0, issues: [],
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

    it('attaches per-issue AWB counts to the cell and the footer they belong to', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Aceh' }])
        .mockResolvedValueOnce([
          {
            d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '1000', margin: '100', weight: '10', incomplete_tos: '2',
          },
        ])
        .mockResolvedValueOnce([
          // Body rows carry a date; the GROUPING SETS footer rows carry d = null.
          { d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh', issue: 'sg_in_rate_missing', awbs: '1' },
          { d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh', issue: 'no_booking', awbs: '3' },
          { d: null, origin_station: 'Jabo', dest_station: 'Aceh', issue: 'no_booking', awbs: '4' },
        ])

      const result = await service.getDailyMatrix('2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([
        { issue: 'no_booking', awbs: 3 },
        { issue: 'sg_in_rate_missing', awbs: 1 },
      ])
      // The footer is NOT the sum of the body: one AWB shipping on two days is one distinct AWB
      // for the period, so the period figure comes from its own grouping set.
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 4 }])
    })

    it('gives a clean cell and a clean footer an empty list rather than null', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Aceh' }])
        .mockResolvedValueOnce([
          {
            d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '1000', margin: '100', weight: '10', incomplete_tos: '0',
          },
        ])
        .mockResolvedValueOnce([])

      const result = await service.getDailyMatrix('2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([])
      expect(result.footer[0].issues).toEqual([])
    })

    it('counts distinct AWBs and asks only for rows that actually have an issue', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDailyMatrix('2026-05-1H')

      const issuesSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(issuesSql).toContain('COUNT(DISTINCT awb)::int AS awbs')
      expect(issuesSql).toContain('issue IS NOT NULL')
      expect(issuesSql).toContain(
        'GROUP BY GROUPING SETS ((d, origin_station, dest_station, issue), (origin_station, dest_station, issue))',
      )
    })
  })

  describe('getRouteComparison', () => {
    // Real-shaped UUIDs, not 'g1'/'g2': group ids round-trip as-is into PnlRouteComparisonColumn.id.
    const G1 = '11111111-1111-4111-8111-111111111111'
    const G2 = '22222222-2222-4222-8222-222222222222'

    // Query order: group routes, facts, issues. The first is skipped when no group is picked.
    function mockQueries(
      groupRoutes: Record<string, string>[],
      facts: Record<string, string>[],
      issues: Record<string, unknown>[] = [],
    ) {
      dataSource.query
        .mockResolvedValueOnce(groupRoutes)
        .mockResolvedValueOnce(facts)
        .mockResolvedValueOnce(issues)
    }

    const fact = (over: Partial<Record<string, string>>) => ({
      d: '2026-05-01',
      col_idx: '0',
      revenue: '0',
      margin: '0',
      cost: '0',
      cost_smu: '0',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: '0',
      ...over,
    })

    const groupRoute = (over: Partial<Record<string, string>>) => ({
      id: G1,
      name: 'Kalimantan',
      origin_station: 'Jabo',
      dest_station: 'Aceh',
      ...over,
    })

    const group = (id: string) => ({ kind: 'group' as const, id })
    const route = (origin: string, dest: string) => ({ kind: 'route' as const, origin, dest })

    it('returns nothing and touches no database when nothing is selected', async () => {
      const result = await service.getRouteComparison([], '2026-05-1H')

      expect(dataSource.query).not.toHaveBeenCalled()
      expect(result).toEqual({ columns: [], rows: [], footer: [], periodDays: 15 })
    })

    it('keeps groups and bare routes in the order they were picked', async () => {
      mockQueries(
        [
          groupRoute({ id: G2, name: 'Sumatera', dest_station: 'Medan' }),
          groupRoute({ id: G1, name: 'Kalimantan', dest_station: 'Pontianak' }),
        ],
        [],
      )

      const result = await service.getRouteComparison(
        [group(G1), route('Jabo', 'Denpasar'), group(G2)],
        '2026-05-1H',
      )

      expect(result.columns.map((c) => [c.kind, c.name])).toEqual([
        ['group', 'Kalimantan'],
        ['route', 'CGK → Denpasar'],
        ['group', 'Sumatera'],
      ])
      // The DB returned G2's routes first; the column order must follow the picks, not the driver.
      expect(result.columns[0].id).toBe(G1)
      expect(result.columns[1].id).toBe('r:Jabo|Denpasar')
    })

    it('exposes each column route list so the frontend can build a drilldown filter from it', async () => {
      mockQueries(
        [
          groupRoute({ dest_station: 'Aceh' }),
          groupRoute({ dest_station: 'Pontianak' }),
        ],
        [],
      )

      const result = await service.getRouteComparison(
        [group(G1), route('Surabaya', 'Denpasar')],
        '2026-05-1H',
      )

      expect(result.columns[0].routes).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Pontianak' },
      ])
      expect(result.columns[0].routeCount).toBe(2)
      expect(result.columns[1].routes).toEqual([
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Denpasar' },
      ])
      expect(result.columns[1].routeCount).toBe(1)
    })

    it('drops a group id that no longer exists rather than rendering an empty column', async () => {
      mockQueries([], [])

      const result = await service.getRouteComparison([group(G1)], '2026-05-1H')

      expect(result.columns).toEqual([])
    })

    it('skips the group query entirely when only bare routes are picked', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.getRouteComparison([route('Jabo', 'Aceh')], '2026-05-1H')

      // Two calls, not three: there is no group to resolve.
      expect(dataSource.query).toHaveBeenCalledTimes(2)
    })

    it('joins the facts to a per-column route list rather than to route_group_routes', async () => {
      mockQueries([groupRoute({})], [])

      await service.getRouteComparison([group(G1)], '2026-05-1H')

      const factSql = (dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('WITH col_routes(col_idx, origin_station, dest_station) AS')
      expect(factSql).toContain('JOIN col_routes cr ON cr.origin_station = v.origin_station')
      expect(factSql).toContain('FILTER (WHERE v.cost_to IS NOT NULL)')
      expect(factSql).not.toContain('route_group_routes')
    })

    it('returns a calendar-complete set of rows for a 1H cycle', async () => {
      mockQueries([groupRoute({})], [])

      const result = await service.getRouteComparison([group(G1)], '2026-05-1H')

      expect(result.rows).toHaveLength(15)
      expect(result.rows[0].date).toBe('2026-05-01')
      expect(result.rows[14].date).toBe('2026-05-15')
      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
      expect(result.periodDays).toBe(15)
    })

    // dataSource.query is mocked here, so this cannot exercise the FILTER clause or catch a SQL
    // error — it only proves the service maps the four component fields off the row through to
    // the cell without dropping or swapping any of them. The actual reconciliation invariant
    // (components sum to `cost`) is asserted against a real database in
    // pnl-group-comparison.integration.spec.ts, which is the only spec that can catch it.
    it('passes the four cost component fields through from the query row unmangled', async () => {
      mockQueries(
        [groupRoute({})],
        [
          fact({
            cost: '14970000',
            cost_smu: '12400000',
            cost_ra: '850000',
            cost_sg_out: '1100000',
            cost_sg_in: '620000',
          }),
        ],
      )

      const cell = (await service.getRouteComparison([group(G1)], '2026-05-1H')).rows[0].cells[0]!

      expect(cell).toEqual({
        revenue: 0,
        margin: 0,
        cost: 14970000,
        costSmu: 12400000,
        costRa: 850000,
        costSgOut: 1100000,
        costSgIn: 620000,
        incompleteTos: 0,
        issues: [],
      })
    })

    it('counts a route shared by two columns in both of them', async () => {
      // Overlap is the point of the join: the columns are independent questions, not a partition,
      // so a route in a group and also picked bare contributes to each column.
      mockQueries(
        [groupRoute({ dest_station: 'Aceh' })],
        [
          fact({ col_idx: '0', revenue: '1000', cost: '800' }),
          fact({ col_idx: '1', revenue: '1000', cost: '800' }),
        ],
      )

      const row = (
        await service.getRouteComparison([group(G1), route('Jabo', 'Aceh')], '2026-05-1H')
      ).rows[0]

      expect(row.cells[0]!.revenue).toBe(1000)
      expect(row.cells[1]!.revenue).toBe(1000)
    })

    it('totals the footer and divides averages by the calendar period', async () => {
      mockQueries(
        [groupRoute({})],
        [
          fact({
            d: '2026-05-01',
            revenue: '1500',
            cost: '900',
            cost_smu: '600',
            cost_ra: '100',
            cost_sg_out: '150',
            cost_sg_in: '50',
            incomplete_tos: '2',
          }),
          fact({
            d: '2026-05-02',
            revenue: '1500',
            cost: '900',
            cost_smu: '600',
            cost_ra: '100',
            cost_sg_out: '150',
            cost_sg_in: '50',
            incomplete_tos: '3',
          }),
        ],
      )

      const footer = (await service.getRouteComparison([group(G1)], '2026-05-1H')).footer[0]

      expect(footer).toEqual({
        totalRevenue: 3000,
        totalMargin: 0,
        totalCost: 1800,
        totalCostSmu: 1200,
        totalCostRa: 200,
        totalCostSgOut: 300,
        totalCostSgIn: 100,
        avgRevenuePerDay: 200, // 3000 / 15 calendar days, not / 2 days with data
        avgMarginPerDay: 0,
        avgCostPerDay: 120,
        incompleteTos: 5,
        issues: [],
      })
    })

    it('drops fact rows for dates outside the period rather than throwing', async () => {
      mockQueries([groupRoute({})], [fact({ d: '2026-06-01', revenue: '999' })])

      const result = await service.getRouteComparison([group(G1)], '2026-05-1H')

      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
      expect(result.footer[0].totalRevenue).toBe(0)
    })

    it('attaches per-issue AWB counts to the cell and the footer they belong to', async () => {
      mockQueries(
        [groupRoute({})],
        [fact({ revenue: '1000', cost: '800' })],
        [
          { d: '2026-05-01', col_idx: '0', issue: 'sg_in_rate_missing', awbs: '1' },
          { d: '2026-05-01', col_idx: '0', issue: 'no_booking', awbs: '3' },
          { d: null, col_idx: '0', issue: 'no_booking', awbs: '4' },
        ],
      )

      const result = await service.getRouteComparison([group(G1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([
        { issue: 'no_booking', awbs: 3 },
        { issue: 'sg_in_rate_missing', awbs: 1 },
      ])
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 4 }])
    })

    it('gives a clean cell and a clean footer an empty issue list rather than null', async () => {
      mockQueries([groupRoute({})], [fact({ revenue: '1000', cost: '800' })], [])

      const result = await service.getRouteComparison([group(G1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([])
      expect(result.footer[0].issues).toEqual([])
    })

    it('reports margin as revenue minus discount minus cost, matching the Daily Report expression', async () => {
      // One column, one day. revenue 1000, discount 15, cost 600 -> margin 385.
      const factRows = [
        {
          d: '2026-05-01',
          col_idx: 0,
          revenue: '1000',
          margin: '385',
          cost: '600',
          cost_smu: '600',
          cost_ra: '0',
          cost_sg_out: '0',
          cost_sg_in: '0',
          incomplete_tos: 0,
        },
      ]

      jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ id: 'g1', name: 'Group 1', origin_station: 'Jakarta', dest_station: 'SUB' }])
        .mockResolvedValueOnce(factRows)
        .mockResolvedValueOnce([])

      const result = await service.getRouteComparison(
        [{ kind: 'group', id: 'g1' }],
        '2026-05-1H',
        undefined,
        undefined,
        'ata_vendor_wh_destination',
      )

      expect(result.rows.find((r) => r.date === '2026-05-01')!.cells[0]!.margin).toBe(385)
      expect(result.footer[0].totalMargin).toBe(385)
    })

    it('selects margin with the same expression the daily matrix uses', async () => {
      const spy = jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ id: 'g1', name: 'Group 1', origin_station: 'Jakarta', dest_station: 'SUB' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getRouteComparison(
        [{ kind: 'group', id: 'g1' }],
        '2026-05-1H',
        undefined,
        undefined,
        'ata_vendor_wh_destination',
      )

      const factSql = spy.mock.calls[1][0] as string
      // Gross revenue is unchanged; margin nets the discount. Written as one normalised string so
      // whitespace in the SQL literal cannot make the assertion pass or fail by accident.
      const normalised = factSql.replace(/\s+/g, ' ')
      expect(normalised).toContain('COALESCE(SUM(v.revenue_total), 0) AS revenue')
      expect(normalised).toContain(
        'COALESCE(SUM(v.revenue_total), 0) - COALESCE(SUM(v.revenue_discount), 0) - COALESCE(SUM(v.cost_to), 0) AS margin',
      )
    })
  })

  describe('getVendorComparison', () => {
    const VG1 = '33333333-3333-4333-8333-333333333333'
    const VG2 = '44444444-4444-4444-8444-444444444444'

    const group = (id: string) => ({ kind: 'group' as const, id })
    const vendor = (name: string) => ({ kind: 'vendor' as const, name })

    // Query order: vendor-group members, stations, then facts / issues / coverage. The first is
    // skipped entirely when no group was picked.
    function mockColumnQueries(groupRows: Record<string, string | null>[]) {
      dataSource.query
        .mockResolvedValueOnce(groupRows)
        .mockResolvedValueOnce([
          { origin_station: 'Jabo', dest_station: 'Denpasar' },
          { origin_station: 'Jabo', dest_station: 'Aceh' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])
    }

    it('builds one column per pick, in pick order, with round-tripping ids', async () => {
      mockColumnQueries([
        { id: VG1, name: 'Vendor Utama', vendor: 'ESP' },
        { id: VG1, name: 'Vendor Utama', vendor: 'Angkasa' },
      ])

      const result = await service.getVendorComparison(
        [group(VG1), vendor('PT Kargo, Tbk')],
        '2026-05-1H',
      )

      expect(result.columns).toEqual([
        {
          id: `vg:${VG1}`,
          name: 'Vendor Utama',
          kind: 'group',
          vendors: ['ESP', 'Angkasa'],
          vendorCount: 2,
        },
        {
          id: 'v:PT Kargo, Tbk',
          name: 'PT Kargo, Tbk',
          kind: 'vendor',
          vendors: ['PT Kargo, Tbk'],
          vendorCount: 1,
        },
      ])
    })

    it('drops a group that was deleted since the picker loaded', async () => {
      // VG2 comes back with no row at all: it no longer exists. Rendering it as a nameless empty
      // column would leave the user with nothing to explain the blank.
      mockColumnQueries([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])

      const result = await service.getVendorComparison([group(VG1), group(VG2)], '2026-05-1H')

      expect(result.columns.map((c) => c.id)).toEqual([`vg:${VG1}`])
    })

    it('keeps a group that has no members yet as an empty column', async () => {
      // LEFT JOIN gives one row with a null vendor for a group with no members.
      mockColumnQueries([{ id: VG1, name: 'Group Kosong', vendor: null }])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.columns[0].vendors).toEqual([])
      expect(result.columns[0].vendorCount).toBe(0)
    })

    it('keeps an unknown vendor name as a column instead of failing the request', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])

      const result = await service.getVendorComparison([vendor('Sudah Hilang')], '2026-05-1H')

      expect(result.columns.map((c) => c.name)).toEqual(['Sudah Hilang'])
      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
    })

    it('rows every station pair the view knows, empty ones included', async () => {
      mockColumnQueries([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows.map((r) => `${r.origin}|${r.dest}`)).toEqual([
        'Jabo|Denpasar',
        'Jabo|Aceh',
      ])
      expect(result.rows[0].originLabel).toBe('CGK')
    })

    const fact = (over: Partial<Record<string, string>>) => ({
      origin_station: 'Jabo',
      dest_station: 'Denpasar',
      col_idx: '0',
      revenue: '0',
      cost: '0',
      margin: '0',
      cost_smu: '0',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: '0',
      ...over,
    })

    // Query order once facts exist: group members, stations, facts, issues, coverage.
    function mockFactQueries(
      facts: Record<string, string>[],
      issues: Record<string, unknown>[] = [],
      coverage: Record<string, string> = { revenue_period: '0', revenue_in_columns: '0' },
    ) {
      dataSource.query
        .mockResolvedValueOnce([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])
        .mockResolvedValueOnce([
          { origin_station: 'Jabo', dest_station: 'Denpasar' },
          { origin_station: 'Jabo', dest_station: 'Aceh' },
        ])
        .mockResolvedValueOnce(facts)
        .mockResolvedValueOnce(issues)
        .mockResolvedValueOnce([coverage])
    }

    it('lands each fact row on its own route and column, leaving the rest null', async () => {
      mockFactQueries([
        fact({ revenue: '1000', cost: '600', margin: '385', cost_smu: '600', incomplete_tos: '2' }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows[0].cells[0]).toEqual({
        revenue: 1000,
        cost: 600,
        margin: 385,
        costSmu: 600,
        costRa: 0,
        costSgOut: 0,
        costSgIn: 0,
        incompleteTos: 2,
        issues: [],
      })
      // 'Jabo|Aceh' had no fact row: null, which is distinct from a real zero.
      expect(result.rows[1].cells[0]).toBeNull()
    })

    it('selects gross revenue and the Daily Report margin expression', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      // Call 2 is the fact query (0 = group members, 1 = stations). Normalised to one line so
      // whitespace in the SQL literal cannot make this pass or fail by accident.
      const factSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('COALESCE(SUM(v.revenue_total), 0) AS revenue')
      expect(factSql).toContain(
        '- COALESCE(SUM(v.revenue_discount), 0) - COALESCE(SUM(v.cost_to), 0) AS margin',
      )
    })

    it('prorates the three AWB-grain components but not cost_sg_in_to', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      const factSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('SUM(v.cost_smu_awb * v.weight_share)')
      expect(factSql).toContain('SUM(v.cost_ra_awb * v.weight_share)')
      expect(factSql).toContain('SUM(v.cost_sg_out_awb * v.weight_share)')
      // cost_sg_in_to already multiplies by weight_share inside the view definition. Multiplying
      // again would square the share and silently understate SG In on every multi-TO AWB.
      expect(factSql).toContain('SUM(COALESCE(v.cost_sg_in_to, 0))')
      expect(factSql).not.toContain('cost_sg_in_to * v.weight_share')
    })

    // A behavioural test cannot see this: with the guard in place no station-less row ever comes
    // back, and without it the JS keying has no way to tell a station_mapping_missing row from the
    // GROUPING SETS super-aggregate. The guard itself is the assertion.
    it('guards both queries against null stations so an issue row cannot pose as the footer', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      for (const callIndex of [2, 3]) {
        const sql = (dataSource.query.mock.calls[callIndex][0] as string).replace(/\s+/g, ' ')
        expect(sql).toContain('AND v.origin_station IS NOT NULL')
        expect(sql).toContain('AND v.dest_station IS NOT NULL')
      }
    })

    it('attaches per-cell issues to their own route and column', async () => {
      mockFactQueries(
        [fact({ revenue: '1000', cost: '600', margin: '385' })],
        [
          { origin_station: 'Jabo', dest_station: 'Denpasar', col_idx: '0', issue: 'no_booking', awbs: '3' },
          // A null origin_station marks the column-wide grouping set, not a route row.
          { origin_station: null, dest_station: null, col_idx: '0', issue: 'no_booking', awbs: '7' },
        ],
      )

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([{ issue: 'no_booking', awbs: 3 }])
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 7 }])
    })

    it('zips columns to vendors as two parallel arrays, so one vendor cannot leak across columns', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { id: VG1, name: 'Vendor Utama', vendor: 'ESP' },
          { id: VG1, name: 'Vendor Utama', vendor: 'Angkasa' },
        ])
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])

      await service.getVendorComparison([group(VG1), vendor('Kargo')], '2026-05-1H')

      const factParams = dataSource.query.mock.calls[2][1] as unknown[]
      // ['2026-05-1H', colIdx[], colVendors[]] — index 0 and 1 pair up positionally.
      expect(factParams[1]).toEqual([0, 0, 1])
      expect(factParams[2]).toEqual(['ESP', 'Angkasa', 'Kargo'])
    })

    it('totals every cell in the column and divides the averages by routes with data', async () => {
      mockFactQueries([
        fact({
          dest_station: 'Denpasar',
          revenue: '1000',
          cost: '600',
          margin: '385',
          cost_smu: '400',
          cost_ra: '100',
          cost_sg_out: '50',
          cost_sg_in: '50',
          incomplete_tos: '1',
        }),
        fact({
          dest_station: 'Aceh',
          revenue: '500',
          cost: '200',
          margin: '292.5',
          cost_smu: '150',
          cost_ra: '25',
          cost_sg_out: '15',
          cost_sg_in: '10',
          incomplete_tos: '2',
        }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0]).toMatchObject({
        totalRevenue: 1500,
        totalCost: 800,
        totalMargin: 677.5,
        totalCostSmu: 550,
        totalCostRa: 125,
        totalCostSgOut: 65,
        totalCostSgIn: 60,
        incompleteTos: 3,
        routesWithData: 2,
        avgRevenuePerRoute: 750,
        avgCostPerRoute: 400,
        avgMarginPerRoute: 338.75,
      })
    })

    // Non-null, not non-zero. A route that flew and made exactly nothing is still a route this
    // column covered; dividing it away would quietly inflate every average.
    it('counts a zero-valued cell as a route with data', async () => {
      mockFactQueries([
        fact({ dest_station: 'Denpasar', revenue: '1000', cost: '400', margin: '585' }),
        fact({ dest_station: 'Aceh', revenue: '0', cost: '0', margin: '0' }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0].routesWithData).toBe(2)
      expect(result.footer[0].avgRevenuePerRoute).toBe(500)
    })

    it('reports null averages, not NaN or Infinity, when the column has no data at all', async () => {
      mockFactQueries([])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0].routesWithData).toBe(0)
      expect(result.footer[0].avgRevenuePerRoute).toBeNull()
      expect(result.footer[0].avgCostPerRoute).toBeNull()
      expect(result.footer[0].avgMarginPerRoute).toBeNull()
    })

    it('reports how much of the period revenue the picked vendors account for', async () => {
      mockFactQueries([], [], { revenue_period: '10000', revenue_in_columns: '3020' })

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.coverage).toEqual({ revenueInColumns: 3020, revenuePeriod: 10000 })
    })

    it('measures coverage against the deduped union of vendors, not the sum of the columns', async () => {
      // ESP sits in the group and is also picked bare. Summing the columns would count its revenue
      // twice and could report more than 100% coverage.
      dataSource.query
        .mockResolvedValueOnce([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '10000', revenue_in_columns: '3020' }])

      await service.getVendorComparison([group(VG1), vendor('ESP')], '2026-05-1H')

      const coverageParams = dataSource.query.mock.calls[4][1] as unknown[]
      expect(coverageParams[1]).toEqual(['ESP'])
      // Scoped by the same station guard as the table, so the banner describes exactly the rows
      // the table could have shown.
      const coverageSql = (dataSource.query.mock.calls[4][0] as string).replace(/\s+/g, ' ')
      expect(coverageSql).toContain('AND v.origin_station IS NOT NULL')
    })

    it('makes no database call at all when nothing was picked', async () => {
      const result = await service.getVendorComparison([], '2026-05-1H')

      expect(dataSource.query).not.toHaveBeenCalled()
      expect(result).toEqual({
        columns: [],
        rows: [],
        footer: [],
        coverage: { revenueInColumns: 0, revenuePeriod: 0 },
      })
    })
  })
})
