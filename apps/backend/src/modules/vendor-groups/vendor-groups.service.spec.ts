import { Test } from '@nestjs/testing'
import { DataSource, EntityManager } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { VendorGroupsService } from './vendor-groups.service'
import { VendorGroupEntity } from './entities/vendor-group.entity'

describe('VendorGroupsService', () => {
  let service: VendorGroupsService
  let dataSource: { query: jest.Mock; transaction: jest.Mock }
  let manager: { getRepository: jest.Mock }
  let groupRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  // Repos handed out by the transactional EntityManager. Deliberately separate doubles from the
  // injected `groupRepo`: create/update must write through the transaction, and a shared double
  // would hide the difference.
  let txGroupRepo: { create: jest.Mock; save: jest.Mock; update: jest.Mock }
  let txVendorRepo: { delete: jest.Mock; insert: jest.Mock }

  beforeEach(async () => {
    groupRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    txGroupRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
    }
    txVendorRepo = { delete: jest.fn(), insert: jest.fn() }
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === VendorGroupEntity ? txGroupRepo : txVendorRepo,
      ),
    }
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    }
    const module = await Test.createTestingModule({
      providers: [
        VendorGroupsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(VendorGroupEntity), useValue: groupRepo },
      ],
    }).compile()
    service = module.get(VendorGroupsService)
  })

  describe('getAvailableVendors', () => {
    it('maps every row to its two independent flags', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
        // Booked but absent from the rate-card master — the case a master-only endpoint would
        // make unselectable altogether.
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: false },
        // On the rate card but never flown — selectable, but renders an all-em-dash column.
        { vendor: 'Sriwijaya Air', has_data: false, in_master: true },
      ])

      await expect(service.getAvailableVendors()).resolves.toEqual([
        { vendor: 'ASIA CARGO', hasData: true, inMaster: true },
        { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false },
        { vendor: 'Sriwijaya Air', hasData: false, inMaster: true },
      ])
    })

    it('queries both sources and unions them rather than joining from the master', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getAvailableVendors()

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain('FROM air_shipments_smu')
      expect(sql).toContain('FROM v_pnl_to')
      expect(sql).toContain('SELECT vendor FROM master UNION SELECT vendor FROM used')
      expect(sql).not.toContain('LEFT JOIN')
    })

    // Decision #7: the stored value has to be byte-identical to v_pnl_to.vendor. BTRIM on one side
    // of that join is a silent bug, so it must not appear anywhere in this query.
    it('filters NULL and empty names explicitly, never by normalising them', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getAvailableVendors()

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain("WHERE vendor IS NOT NULL AND vendor <> ''")
      expect(sql).not.toContain('BTRIM')
      expect(sql).not.toContain('NULLIF')
      expect(sql).not.toContain('LOWER')
    })

    it('returns an empty list when neither source has a vendor', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.getAvailableVendors()).resolves.toEqual([])
    })
  })
})
