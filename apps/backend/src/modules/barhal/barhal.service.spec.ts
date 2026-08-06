import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BarhalService, normalizeStationName } from './barhal.service'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'
import { RecapPerRuteRow } from './barhal-recap.builder'

describe('normalizeStationName', () => {
  it('strips a trailing "DC" suffix and trims whitespace', () => {
    expect(normalizeStationName('Kosambi DC')).toBe('Kosambi')
    expect(normalizeStationName('Badung  DC ')).toBe('Badung')
    expect(normalizeStationName('Denpasar')).toBe('Denpasar')
    expect(normalizeStationName(null)).toBe('')
  })

  it('normalizes casing so inconsistently-typed sheet data matches', () => {
    expect(normalizeStationName('MAKASSAR')).toBe('Makassar')
    expect(normalizeStationName('makassar dc')).toBe('Makassar')
    expect(normalizeStationName('JAKARTA')).toBe(normalizeStationName('jakarta'))
  })
})

describe('BarhalService', () => {
  let service: BarhalService
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        BarhalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(BarhalKoli), useValue: {} },
        { provide: getRepositoryToken(BarhalKoliTo), useValue: {} },
      ],
    }).compile()
    service = module.get(BarhalService)
  })

  describe('getAvailableTos', () => {
    it('filters to Barhal-only TOs and applies search/date/origin/dest params', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10, origin_station: 'Kosambi DC', dest_station: 'Badung DC', lt_number: 'LT1', remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const rows = await service.getAvailableTos({ search: 'TO1', date: '2026-06-01', origin: 'Kosambi', dest: 'Badung' })
      expect(rows).toHaveLength(1)
      expect(rows[0].vendor).toBe('ESP')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/remarks ILIKE/i)
      expect(params).toContain('%barhal%')
      expect(params).toContain('%TO1%')
    })
  })

  describe('createKoliShell', () => {
    it('generates a koli_number from date/origin/dest and creates an empty shell', async () => {
      dataSource.query
        .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
        .mockResolvedValueOnce([{ count: 0 }]) // sequence count
      const manager = { query: dataSource.query, create: jest.fn((_, v) => v), save: jest.fn((v) => Promise.resolve(v)) }
      ;(service as any).dataSource.transaction = jest.fn((cb: any) => cb(manager))
      const koli = await service.createKoliShell({ koliDate: '2026-06-01', origin: 'Kosambi DC', dest: 'Badung DC', komoditi: 'HP' })
      expect(koli.koli_number).toBe('1Jun-Kosambi-Badung-Barhal1')
      expect(koli.origin_name).toBe('Kosambi')
      expect(koli.dest_name).toBe('Badung')
      expect(koli.total_to).toBe(0)
      expect(koli.weight_before).toBeNull()
    })
  })

  describe('attachTos', () => {
    it('sums gross_weight into weight_before and sets total_to, reloading with lines relation', async () => {
      const reloaded = { id: 'k1', weight_before: 15, total_to: 2, lines: [{ to_number: 'TO1' }, { to_number: 'TO2' }] }
      const koliRepo = {
        findOne: jest.fn().mockResolvedValueOnce({ id: 'k1' }).mockResolvedValueOnce(reloaded),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10 },
        { to_number: 'TO2', awb: 'AWB2', gross_weight: 5 },
      ])
      const lineRepo = { create: jest.fn((v) => v), save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) }
      ;(service as any).lineRepo = lineRepo
      const koli = await service.attachTos('k1', { toNumbers: ['TO1', 'TO2'] })
      expect(lineRepo.delete).toHaveBeenCalledWith({ koli_id: 'k1' })
      expect(koli).toBe(reloaded)
      expect(koliRepo.findOne).toHaveBeenLastCalledWith({ where: { id: 'k1' }, relations: ['lines'] })
    })

    it('detaches all TOs when toNumbers is empty, without querying air_shipments_compileaircgk', async () => {
      const reloaded = { id: 'k1', weight_before: 0, total_to: 0, lines: [] }
      const koliRepo = {
        findOne: jest.fn().mockResolvedValueOnce({ id: 'k1' }).mockResolvedValueOnce(reloaded),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const lineRepo = { create: jest.fn((v) => v), save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) }
      ;(service as any).lineRepo = lineRepo
      const koli = await service.attachTos('k1', { toNumbers: [] })
      expect(dataSource.query).not.toHaveBeenCalled()
      expect(lineRepo.delete).toHaveBeenCalledWith({ koli_id: 'k1' })
      expect(lineRepo.save).not.toHaveBeenCalled()
      expect(koli.total_to).toBe(0)
    })
  })

  describe('updatePacking', () => {
    it('computes volume as (L*W*H)/6000 and stores weightAfter/batangKayu', async () => {
      const koliRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'k1', weight_before: 100 }),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const koli = await service.updatePacking('k1', { weightAfter: 120, lengthCm: 60, widthCm: 50, heightCm: 40, batangKayu: 8 })
      expect(koli.weight_after).toBe(120)
      expect(koli.volume).toBeCloseTo(20)
      expect(koli.batang_kayu).toBe(8)
    })
  })

  describe('updateSmu', () => {
    it('does not overwrite existing fields left blank', async () => {
      const koliRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'k1', smu_number: 'SMU-OLD', airlines: 'Garuda' }),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const koli = await service.updateSmu('k1', { flightNo: 'GA123' })
      expect(koli.smu_number).toBe('SMU-OLD')
      expect(koli.airlines).toBe('Garuda')
      expect(koli.flight_no).toBe('GA123')
    })
  })

  describe('bulkUpdateSmu', () => {
    it('updates every koli matching date+dest, skipping blank fields', async () => {
      const koliRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'k1', smu_number: 'OLD' },
          { id: 'k2', smu_number: null },
        ]),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const manager = { save: jest.fn((_, v) => Promise.resolve(v)) }
      ;(service as any).dataSource.transaction = jest.fn((cb: any) => cb(manager))
      const result = await service.bulkUpdateSmu({ koliDate: '2026-06-01', dest: 'Badung', airlines: 'Garuda' })
      expect(result.updated).toBe(2)
      expect(manager.save).toHaveBeenCalledTimes(2)
      expect(koliRepo.save).not.toHaveBeenCalled()
      expect(koliRepo.find).toHaveBeenCalledWith({ where: { koli_date: '2026-06-01', dest_name: 'Badung' } })
    })
  })

  describe('deleteKoli', () => {
    it('deletes an existing koli', async () => {
      const koliRepo = { findOne: jest.fn().mockResolvedValue({ id: 'k1' }), delete: jest.fn().mockResolvedValue(undefined) }
      ;(service as any).koliRepo = koliRepo
      await service.deleteKoli('k1')
      expect(koliRepo.delete).toHaveBeenCalledWith({ id: 'k1' })
    })

    it('throws NotFoundException when koli does not exist', async () => {
      const koliRepo = { findOne: jest.fn().mockResolvedValue(null), delete: jest.fn() }
      ;(service as any).koliRepo = koliRepo
      await expect(service.deleteKoli('missing')).rejects.toThrow('Koli not found')
      expect(koliRepo.delete).not.toHaveBeenCalled()
    })
  })

  describe('unassignSmu', () => {
    it('clears SMU/flight fields from every koli sharing smuNumber', async () => {
      const koliRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'k1', smu_number: 'SMU-1', airlines: 'Garuda', flight_no: 'GA123', std: new Date(), sta: new Date() },
          { id: 'k2', smu_number: 'SMU-1', airlines: 'Garuda', flight_no: 'GA123', std: new Date(), sta: new Date() },
        ]),
      }
      ;(service as any).koliRepo = koliRepo
      const manager = { save: jest.fn((_, v) => Promise.resolve(v)) }
      ;(service as any).dataSource.transaction = jest.fn((cb: any) => cb(manager))
      const result = await service.unassignSmu('SMU-1')
      expect(result.updated).toBe(2)
      expect(manager.save).toHaveBeenCalledTimes(2)
      const [, savedKoli] = manager.save.mock.calls[0]
      expect(savedKoli.smu_number).toBeNull()
      expect(savedKoli.airlines).toBeNull()
      expect(savedKoli.flight_no).toBeNull()
      expect(savedKoli.std).toBeNull()
      expect(savedKoli.sta).toBeNull()
    })

    it('throws NotFoundException when no koli has that smuNumber', async () => {
      const koliRepo = { find: jest.fn().mockResolvedValue([]) }
      ;(service as any).koliRepo = koliRepo
      await expect(service.unassignSmu('MISSING')).rejects.toThrow('SMU not found')
    })
  })

  describe('getSmuList', () => {
    it('groups Koli by smu_number and sums matched chWt by AWB, applying date/origin/dest filters', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          smuNumber: 'SMU-1',
          date: '2026-06-01',
          originName: 'Kosambi',
          destName: 'Badung',
          totalKoli: 2,
          totalTo: 3,
          airlines: 'Garuda',
          flightNo: 'GA123',
          std: '2026-06-01T10:00:00.000Z',
          sta: '2026-06-01T12:00:00.000Z',
          chwt: 42,
        },
      ])
      const rows = await service.getSmuList({ date: '2026-06-01', origin: 'Kosambi', dest: 'Badung' })
      expect(rows).toHaveLength(1)
      expect(rows[0].smuNumber).toBe('SMU-1')
      expect(rows[0].chwt).toBe(42)
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/smu_number IS NOT NULL/)
      expect(sql).toMatch(/GROUP BY k\.smu_number/)
      expect(params).toEqual(['2026-06-01', 'Kosambi', 'Badung'])
    })

    it('surfaces chwt as null when no AWB in the group matches the rate table', async () => {
      dataSource.query.mockResolvedValueOnce([
        { smuNumber: 'SMU-2', date: '2026-06-02', originName: 'A', destName: 'B', totalKoli: 1, totalTo: 1, airlines: null, flightNo: null, std: null, sta: null, chwt: null },
      ])
      const rows = await service.getSmuList({})
      expect(rows[0].chwt).toBeNull()
    })

    it('coerces numeric chwt from string to JS number when Postgres returns NUMERIC-as-string', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          smuNumber: 'SMU-3',
          date: '2026-06-03',
          originName: 'Jakarta',
          destName: 'Surabaya',
          totalKoli: 1,
          totalTo: 2,
          airlines: 'Batik',
          flightNo: 'BT456',
          std: '2026-06-03T08:00:00.000Z',
          sta: '2026-06-03T10:30:00.000Z',
          chwt: '42.50',
        },
      ])
      const rows = await service.getSmuList({})
      expect(rows).toHaveLength(1)
      expect(rows[0].chwt).toBe(42.5)
      expect(typeof rows[0].chwt).toBe('number')
    })
  })

  describe('getDashboard', () => {
    it('returns TO-POV kpi/chartByDate/recapBatangKayu/recapPerTanggal/recapPerRute', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 2, total_to: 3, weight_before: 30, weight_increase: 6, batang_kayu: 10 }]) // kpi
        .mockResolvedValueOnce([
          { date: '2026-06-01', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerTanggal
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 1, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerRute
        .mockResolvedValueOnce([]) // masterRoutes
        .mockResolvedValueOnce([
          { date: '2026-06-01', totalKoli: 2, totalP: 100, totalL: 80, totalT: 60, totalVolume: 80, totalBatangKayu: 10 },
        ]) // recapBatangKayu

      const result = await service.getDashboard({})

      expect(result.kpi).toEqual({
        totalKoli: 2,
        totalTo: 3,
        totalWeightBefore: 30,
        totalWeightAfter: 36,
        totalVariance: 6,
        totalBatangKayu: 10,
      })
      expect(result.chartByDate).toEqual([{ date: '2026-06-01', weightBefore: 30, weightAfter: 36, chwt: 25 }])
      expect(result.recapPerTanggal[0]).toMatchObject({
        date: '2026-06-01',
        totalTo: 3,
        totalKoli: 2,
        weightBefore: 30,
        weightAfter: 36,
        chwt: 25,
        variance: 6,
        addRevenue: 500,
        status: 'completed',
      })
      expect(result.recapPerTanggal[0].variancePercent).toBeCloseTo(20)
      expect(result.recapPerRute[0]).toMatchObject({
        originName: 'Kosambi',
        destName: 'Badung',
        status: 'incomplete',
      })
      expect(result.recapBatangKayu).toEqual([
        { date: '2026-06-01', totalKoli: 2, totalP: 100, totalL: 80, totalT: 60, totalVolume: 80, totalBatangKayu: 10 },
      ])
    })

    it('reports variancePercent as 0 when weightBefore is 0 (no division by zero)', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 0, awb_count: 0, total_koli: 0, weight_before: 0, chwt: 0, missing_chwt: 0, weight_increase: 0, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].variancePercent).toBe(0)
    })

    it('keeps a date completed even when barhal TOs there are still unpacked', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 10, weight_before: 30, weight_increase: 6, batang_kayu: 0 }])
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 10, awb_count: 2, total_koli: 1, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].status).toBe('completed')
    })

    it('groups per tanggal over TO dates unioned with Koli dates, ascending, keyed on awb_count', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({})

      const perTanggalSql: string = dataSource.query.mock.calls[1][0]
      expect(perTanggalSql).toContain('SELECT to_date AS koli_date FROM scoped')
      expect(perTanggalSql).toContain('UNION')
      expect(perTanggalSql).toContain('AS awb_count')
      expect(perTanggalSql).toContain('ORDER BY g.koli_date ASC')
      expect(perTanggalSql).not.toContain('attached_to')
    })

    it('groups per rute over TO routes unioned with Koli routes, keyed on awb_count', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({})

      const perRuteSql: string = dataSource.query.mock.calls[2][0]
      expect(perRuteSql).toContain('SELECT origin_name, dest_name FROM scoped')
      expect(perRuteSql).toContain('UNION')
      expect(perRuteSql).toContain('AS awb_count')
      expect(perRuteSql).not.toContain('attached_to')
    })

    it('returns one row per calendar date when a full range is given', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-04' })

      expect(result.recapPerTanggal.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'])
      expect(result.recapPerTanggal[0]).toMatchObject({ totalTo: 0, totalKoli: 0, status: 'incomplete' })
      expect(result.recapPerTanggal[1]).toMatchObject({ totalTo: 1, status: 'completed' })
    })

    it('leaves recapPerTanggal sparse when no range is given', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal.map((r) => r.date)).toEqual(['2026-06-02'])
    })

    it('keeps chartByDate on dates that have data, not the filled-in ones', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-04' })
      expect(result.chartByDate).toEqual([{ date: '2026-06-02', weightBefore: 10, weightAfter: 12, chwt: 9 }])
    })

    it('rejects a range longer than 366 dates without running any query', async () => {
      await expect(service.getDashboard({ startDate: '2024-01-01', endDate: '2025-01-01' })).rejects.toThrow(
        'Date range must not exceed 366 days',
      )
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    it('accepts a full leap year', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2024-01-01', endDate: '2024-12-31' })
      expect(result.recapPerTanggal).toHaveLength(366)
    })

    it('lists every barhal route, zero-filling the ones with no activity in range', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung' },
          { originName: 'Kosambi', destName: 'Makassar' },
        ])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})

      expect(result.recapPerRute.map((r) => `${r.originName}-${r.destName}`)).toEqual([
        'Kosambi-Badung',
        'Kosambi-Makassar',
      ])
      expect(result.recapPerRute[0]).toMatchObject({ totalKoli: 1, status: 'completed' })
      expect(result.recapPerRute[1]).toMatchObject({ totalTo: 0, totalKoli: 0, chwt: 0, status: 'incomplete' })
    })

    it('queries master routes across all barhal TOs, unfiltered by date but narrowed by origin/dest', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-02', origin: 'Kosambi', dest: 'Badung' })

      const [sql, sqlParams] = dataSource.query.mock.calls[3]
      expect(sql).toContain('FROM air_shipments_compileaircgk e')
      expect(sql).toContain("e.remarks ILIKE '%barhal%'")
      expect(sql).not.toContain('completed_date BETWEEN')
      expect(sqlParams).toEqual(['Kosambi', 'Badung'])
    })
  })

  describe('getDrilldown', () => {
    it('groups by route for a single date, without zero-filling master routes', async () => {
      dataSource.query.mockResolvedValueOnce([
        { originName: 'Kosambi', destName: 'Badung', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
      ])

      const rows = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })

      expect(dataSource.query).toHaveBeenCalledTimes(1)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        originName: 'Kosambi',
        destName: 'Badung',
        totalTo: 3,
        totalKoli: 2,
        weightBefore: 30,
        weightAfter: 36,
        chwt: 25,
        variance: 6,
        addRevenue: 500,
        status: 'completed',
      })
    })

    it('groups by date for a single route, without zero-filling the calendar', async () => {
      dataSource.query.mockResolvedValueOnce([
        { date: '2026-06-03', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 8, missing_chwt: 0, weight_increase: 2, add_revenue: 100 },
      ])

      const rows = await service.getDrilldown({
        groupBy: 'date',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        origin: 'Kosambi',
        dest: 'Badung',
      })

      // Rentangnya 30 hari, tapi drilldown hanya mengembalikan hari yang ada aktivitasnya.
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ date: '2026-06-03', totalTo: 1, status: 'completed' })
    })

    it('binds the date range, origin and dest as query parameters', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getDrilldown({
        groupBy: 'date',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        origin: 'Kosambi',
        dest: 'Badung',
      })

      const [, params] = dataSource.query.mock.calls[0]
      expect(params).toEqual(['2026-06-01', '2026-06-30', 'Kosambi', 'Badung'])
    })

    it('returns an empty array when the group has no activity', async () => {
      dataSource.query.mockResolvedValueOnce([])
      const rows = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })
      expect(rows).toEqual([])
    })

    it('rejects a range longer than 366 days without running any query', async () => {
      await expect(
        service.getDrilldown({ groupBy: 'route', startDate: '2026-01-01', endDate: '2027-06-01' }),
      ).rejects.toThrow(/366/)
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    it('reconciles: per-route drilldown totals for a date match that date\'s parent row', async () => {
      // Baris induk Rekap Per Tanggal untuk 2026-06-01.
      dataSource.query.mockResolvedValueOnce([
        { date: '2026-06-01', total_to: 5, awb_count: 2, total_koli: 3, weight_before: 50, chwt: 40, missing_chwt: 0, weight_increase: 10, add_revenue: 900 },
      ])
      const parent = await service.getDrilldown({ groupBy: 'date', startDate: '2026-06-01', endDate: '2026-06-01' })

      dataSource.query.mockResolvedValueOnce([
        { originName: 'Kosambi', destName: 'Badung', total_to: 2, awb_count: 1, total_koli: 1, weight_before: 20, chwt: 15, missing_chwt: 0, weight_increase: 4, add_revenue: 400 },
        { originName: 'Kosambi', destName: 'Batam', total_to: 3, awb_count: 1, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
      ])
      const children = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })

      // Cast diperlukan: getDrilldown mengembalikan union dua tipe array, dan `.reduce`
      // tidak dapat dipanggil langsung di atas union seperti itu.
      const sum = (key: 'totalTo' | 'totalKoli' | 'weightBefore' | 'chwt' | 'addRevenue') =>
        (children as RecapPerRuteRow[]).reduce((acc, row) => acc + row[key], 0)

      expect(sum('totalTo')).toBe(parent[0].totalTo)
      expect(sum('totalKoli')).toBe(parent[0].totalKoli)
      expect(sum('weightBefore')).toBe(parent[0].weightBefore)
      expect(sum('chwt')).toBe(parent[0].chwt)
      expect(sum('addRevenue')).toBe(parent[0].addRevenue)
    })
  })

  describe('getToDetail', () => {
    it('joins barhal_koli_to and returns koliNumber for the in-koli tab', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            date: '2026-07-26',
            originName: 'Makassar',
            destName: 'Kosambi',
            toNumber: 'TO1',
            koliNumber: '26Jul-Makassar-Kosambi-Barhal1',
            grossWeight: '12.5',
          },
        ])

      const result = await service.getToDetail({ tab: 'in-koli', page: 1, pageSize: 25 })

      expect(result.total).toBe(1)
      expect(result.data).toEqual([
        {
          date: '2026-07-26',
          originName: 'Makassar',
          destName: 'Kosambi',
          toNumber: 'TO1',
          koliNumber: '26Jul-Makassar-Kosambi-Barhal1',
          grossWeight: 12.5,
        },
      ])

      const [countSql] = dataSource.query.mock.calls[0]
      const [dataSql] = dataSource.query.mock.calls[1]
      expect(countSql).toMatch(/JOIN barhal_koli_to/i)
      expect(dataSql).toMatch(/JOIN barhal_koli k ON k\.id = bkt\.koli_id/i)
      expect(dataSql).toMatch(/remarks ILIKE '%barhal%'/i)
    })

    it('uses NOT EXISTS and yields a null koliNumber for the not-in-koli tab', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            date: '2026-07-26',
            originName: 'Makassar',
            destName: 'Kosambi',
            toNumber: 'TO9',
            koliNumber: null,
            grossWeight: null,
          },
        ])

      const result = await service.getToDetail({ tab: 'not-in-koli', page: 1, pageSize: 25 })

      expect(result.data[0].koliNumber).toBeNull()
      expect(result.data[0].grossWeight).toBeNull()
      const [dataSql] = dataSource.query.mock.calls[1]
      expect(dataSql).toMatch(/NOT EXISTS/i)
      expect(dataSql).not.toMatch(/JOIN barhal_koli_to/i)
    })

    it('binds date range, origin and dest as parameters', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([])

      await service.getToDetail({
        tab: 'in-koli',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        origin: 'Makassar',
        dest: 'Kosambi',
        page: 1,
        pageSize: 25,
      })

      const [countSql, countParams] = dataSource.query.mock.calls[0]
      expect(countParams).toEqual(['2026-07-01', '2026-07-31', 'Makassar', 'Kosambi'])
      expect(countSql).toMatch(/completed_date BETWEEN \$1 AND \$2/i)
      expect(countSql).not.toMatch(/Makassar/)
    })

    it('translates page and pageSize into LIMIT and OFFSET', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 60 }]).mockResolvedValueOnce([])

      const result = await service.getToDetail({ tab: 'in-koli', page: 3, pageSize: 20 })

      const [dataSql, dataParams] = dataSource.query.mock.calls[1]
      expect(dataSql).toMatch(/LIMIT \$1 OFFSET \$2/i)
      expect(dataParams).toEqual([20, 40])
      expect(result.page).toBe(3)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(60)
    })
  })
})
