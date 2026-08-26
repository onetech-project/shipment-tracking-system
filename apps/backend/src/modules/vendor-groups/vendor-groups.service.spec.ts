import { ConflictException, NotFoundException } from '@nestjs/common'
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

  describe('findAll', () => {
    it('returns each group with its vendor names', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        { id: 'vg1', name: 'Maskapai', description: null, vendor: 'Sriwijaya Air' },
        { id: 'vg2', name: 'Kargo', description: 'pihak ketiga', vendor: 'ASIA CARGO' },
      ])

      await expect(service.findAll()).resolves.toEqual([
        {
          id: 'vg1',
          name: 'Maskapai',
          description: null,
          vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
        },
        { id: 'vg2', name: 'Kargo', description: 'pihak ketiga', vendors: ['ASIA CARGO'] },
      ])
    })

    it('returns an empty array when there are no groups', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.findAll()).resolves.toEqual([])
    })

    it('yields vendors: [] for a group whose LEFT JOIN produced a single all-null row', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Empty', description: null, vendor: null },
      ])

      await expect(service.findAll()).resolves.toEqual([
        { id: 'vg1', name: 'Empty', description: null, vendors: [] },
      ])
    })
  })

  describe('create', () => {
    it('rejects a vendor that is in neither the master nor the observed set', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])

      const rejection = service.create({ name: 'Bad', vendors: ['NOBODY AIR'] })

      await expect(rejection).rejects.toThrow('Unknown vendor: NOBODY AIR')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    // A vendor that exists only in v_pnl_to must be accepted — that is the entire reason
    // getAvailableVendors is a union rather than a master lookup.
    it('accepts a vendor that exists only in the observed set', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: false }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).resolves.toEqual({
        id: 'new-id',
        name: 'Maskapai',
        description: null,
        vendors: ['GARUDA INDONESIA'],
      })
    })

    // Case and whitespace are significant: 'garuda indonesia' is a different vendor from
    // 'GARUDA INDONESIA' as far as the comparison join is concerned, so it must not be accepted
    // by accident.
    it('matches vendor names exactly, without folding case or trimming', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])

      const rejection = service.create({ name: 'Maskapai', vendors: ['garuda indonesia'] })

      await expect(rejection).rejects.toThrow('Unknown vendor: garuda indonesia')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects a vendor name with leading or trailing whitespace when the trimmed form is not in the known set', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])

      const rejection = service.create({ name: 'Maskapai', vendors: [' GARUDA INDONESIA'] })

      await expect(rejection).rejects.toThrow('Unknown vendor:  GARUDA INDONESIA')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects a duplicate name with a conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce({ id: 'existing', name: 'Maskapai' })

      const rejection = service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] })

      await expect(rejection).rejects.toThrow('A vendor group named "Maskapai" already exists')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    it('saves the group, de-dupes the vendors, and returns the created group', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: 'pulau', vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      const result = await service.create({
        name: 'Maskapai',
        description: 'pulau',
        vendors: ['GARUDA INDONESIA', 'GARUDA INDONESIA'],
      })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Maskapai', description: 'pulau' }),
      )
      expect(txVendorRepo.delete).toHaveBeenCalledWith({ vendorGroupId: 'new-id' })
      expect(txVendorRepo.insert).toHaveBeenCalledWith([
        { vendorGroupId: 'new-id', vendor: 'GARUDA INDONESIA' },
      ])
      // The writes must go through the transactional manager, not the injected repos — that is the
      // whole point of wrapping them together.
      expect(groupRepo.save).not.toHaveBeenCalled()
      expect(groupRepo.update).not.toHaveBeenCalled()
      expect(result).toEqual({
        id: 'new-id',
        name: 'Maskapai',
        description: 'pulau',
        vendors: ['GARUDA INDONESIA'],
      })
    })

    it('normalizes a whitespace-only description to null', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      await service.create({
        name: 'Maskapai',
        description: '   ',
        vendors: ['GARUDA INDONESIA'],
      })

      expect(txGroupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
    })

    it('maps a unique-name race (23505 on uq_vendor_groups_name) to the same ConflictException as the pre-check', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txGroupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_vendor_groups_name',
        }),
      )

      const rejection = service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] })

      await expect(rejection).rejects.toThrow('A vendor group named "Maskapai" already exists')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    it('does not remap a 23505 from an unrelated constraint into a name conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txGroupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('some other violation'), {
          code: '23505',
          constraint: 'pk_vendor_group_vendors',
        }),
      )

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('some other violation')
    })

    it('propagates an error from the transactional vendor insert rather than swallowing it', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txVendorRepo.insert.mockRejectedValueOnce(new Error('insert failed'))

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('insert failed')

      expect(dataSource.transaction).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      const rejection = service.update('missing', { name: 'X' })

      await expect(rejection).rejects.toThrow('Vendor group not found')
      await expect(rejection).rejects.toBeInstanceOf(NotFoundException)
    })

    // Mirrors create's "rejects a duplicate name with a conflict": here the pre-check itself throws,
    // rather than racing into the 23505 catch below.
    it('rejects a duplicate name with a conflict', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce({ id: 'vg1', name: 'Maskapai' })
        .mockResolvedValueOnce({ id: 'vg2', name: 'Kargo' })

      const rejection = service.update('vg1', { name: 'Kargo' })

      await expect(rejection).rejects.toThrow('A vendor group named "Kargo" already exists')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    // The `dto.name !== existing.name` half of the pre-check guard exists precisely so a self-rename
    // never races against its own row. Pinning the findOne call count makes deleting that half of the
    // guard fail this test even though assertNameFree's default (unmocked) lookup wouldn't itself throw.
    it('does not run the conflict pre-check on a self-rename', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: 'pulau', vendor: null },
      ])

      const result = await service.update('vg1', { name: 'Maskapai' })

      expect(groupRepo.findOne).toHaveBeenCalledTimes(1)
      expect(result.name).toBe('Maskapai')
    })

    // replaceVendors is gated by `if (dto.vendors)`; a name-only patch must leave membership rows
    // alone rather than deleting and re-inserting an empty set.
    it('leaves vendor_group_vendors untouched on a name-only update', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce({ id: 'vg1', name: 'Lama', description: null })
        .mockResolvedValueOnce(null)
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Baru', description: null, vendor: null },
      ])

      await service.update('vg1', { name: 'Baru' })

      expect(txVendorRepo.delete).not.toHaveBeenCalled()
      expect(txVendorRepo.insert).not.toHaveBeenCalled()
    })

    it('replaces the vendors without touching name/description when only vendors are given', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'ASIA CARGO', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'vg1', name: 'Maskapai', description: 'pulau', vendor: 'ASIA CARGO' },
        ])

      const result = await service.update('vg1', { vendors: ['ASIA CARGO'] })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.update).not.toHaveBeenCalled()
      expect(txVendorRepo.delete).toHaveBeenCalledWith({ vendorGroupId: 'vg1' })
      expect(txVendorRepo.insert).toHaveBeenCalledWith([
        { vendorGroupId: 'vg1', vendor: 'ASIA CARGO' },
      ])
      expect(groupRepo.update).not.toHaveBeenCalled()
      expect(result.name).toBe('Maskapai')
      expect(result.description).toBe('pulau')
    })

    it('rejects an unknown vendor before writing anything', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'vg1', name: 'Maskapai', description: null })
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
      ])

      const rejection = service.update('vg1', { vendors: ['NOBODY AIR'] })

      await expect(rejection).rejects.toThrow('Unknown vendor: NOBODY AIR')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('normalizes description to null when explicitly cleared', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: null, vendor: null },
      ])

      await service.update('vg1', { description: null })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.update).toHaveBeenCalledWith('vg1', { description: null })
      expect(groupRepo.update).not.toHaveBeenCalled()
    })

    it('maps a unique-name race (23505 on uq_vendor_groups_name) to the same ConflictException as the pre-check', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce({ id: 'vg1', name: 'Lama' })
        .mockResolvedValueOnce(null)
      txGroupRepo.update.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_vendor_groups_name',
        }),
      )

      const rejection = service.update('vg1', { name: 'Baru' })

      await expect(rejection).rejects.toThrow('A vendor group named "Baru" already exists')
      await expect(rejection).rejects.toBeInstanceOf(ConflictException)
    })

    it('propagates an error from the transactional vendor insert rather than swallowing it', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
      ])
      txVendorRepo.insert.mockRejectedValueOnce(new Error('insert failed'))

      await expect(service.update('vg1', { vendors: ['ASIA CARGO'] })).rejects.toThrow(
        'insert failed',
      )

      expect(dataSource.transaction).toHaveBeenCalled()
    })

    // An empty patch with no vendors has nothing to write, so it must not open a transaction just
    // to read the row back.
    it('skips the transaction entirely when the patch is empty and no vendors are given', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: 'pulau', vendor: null },
      ])

      const result = await service.update('vg1', {})

      expect(dataSource.transaction).not.toHaveBeenCalled()
      expect(result).toEqual({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
        vendors: [],
      })
    })
  })

  describe('remove', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      const rejection = service.remove('missing')

      await expect(rejection).rejects.toThrow('Vendor group not found')
      await expect(rejection).rejects.toBeInstanceOf(NotFoundException)
    })

    it('deletes the group by id', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'vg1', name: 'Maskapai' })

      await service.remove('vg1')

      expect(groupRepo.delete).toHaveBeenCalledWith('vg1')
    })
  })
})
