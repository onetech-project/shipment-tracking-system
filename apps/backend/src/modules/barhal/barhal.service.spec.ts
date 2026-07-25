import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BarhalService, normalizeStationName } from './barhal.service'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'

describe('normalizeStationName', () => {
  it('strips a trailing "DC" suffix and trims whitespace', () => {
    expect(normalizeStationName('Kosambi DC')).toBe('Kosambi')
    expect(normalizeStationName('Badung  DC ')).toBe('Badung')
    expect(normalizeStationName('Denpasar')).toBe('Denpasar')
    expect(normalizeStationName(null)).toBe('')
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
      const koli = await service.createKoliShell({ koliDate: '2026-06-01', origin: 'Kosambi DC', dest: 'Badung DC' })
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
          { date: '2026-06-01', total_to: 3, attached_to: 3, total_koli: 2, weight_before: 30, chwt: 25, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerTanggal
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 3, attached_to: 2, total_koli: 2, weight_before: 30, chwt: 25, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerRute
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
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 0, attached_to: 0, total_koli: 0, weight_before: 0, chwt: 0, weight_increase: 0, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].variancePercent).toBe(0)
    })
  })
})
