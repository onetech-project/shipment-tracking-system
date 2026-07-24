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
})
