import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetMasterDataService } from './fleet-master-data.service'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'

describe('FleetMasterDataService', () => {
  let service: FleetMasterDataService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    dataSource = { query: jest.fn(async () => [{ count: '0' }]) }

    const module = await Test.createTestingModule({
      providers: [
        FleetMasterDataService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: repo },
      ],
    }).compile()
    service = module.get(FleetMasterDataService)
  })

  describe('findAll', () => {
    it('filters by category and hides inactive rows by default', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll('leasing')
      expect(repo.find).toHaveBeenCalledWith({
        where: { category: 'leasing', isActive: true },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })

    it('includes inactive rows when asked', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll('leasing', true)
      expect(repo.find).toHaveBeenCalledWith({
        where: { category: 'leasing' },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })

    it('returns every category when none is given', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll()
      expect(repo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })
  })

  describe('create', () => {
    it('rejects a code already used in the same category', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing' })
      await expect(
        service.create({ category: 'leasing', code: 'mtf', label: 'MTF' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    // The unique constraint is (category, code) — the same code under a different category is
    // a different row and must be allowed.
    it('allows the same code under a different category', async () => {
      repo.findOne.mockResolvedValue(null)
      const row = await service.create({ category: 'jenis_berkas', code: 'kir', label: 'Buku Uji' })
      expect(row).toMatchObject({ category: 'jenis_berkas', code: 'kir' })
      // A null-for-anything mock cannot tell a category-scoped lookup from a global one, so assert
      // the where-clause itself: a category-blind pre-check would 409 this `kir` because `kir`
      // already exists under jenis_dokumen.
      expect(repo.findOne).toHaveBeenCalledWith({ where: { category: 'jenis_berkas', code: 'kir' } })
    })

    it('reshapes a racing unique violation into a ConflictException', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.save.mockRejectedValue({ code: '23505', constraint: 'uq_fleet_master_data_cat_code' })
      await expect(
        service.create({ category: 'leasing', code: 'mtf', label: 'MTF' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    // (category, code) is the table's only unique constraint today, so a catch that keyed on the
    // 23505 code alone would look correct. A Phase 2 constraint would then be reshaped into a
    // misleading "Code already exists" 409 -- anything that is not our constraint must surface
    // unchanged, which also covers the re-raise path.
    it('re-raises a 23505 from a different constraint unchanged', async () => {
      repo.findOne.mockResolvedValue(null)
      const err = { code: '23505', constraint: 'uq_fleet_master_data_label' }
      repo.save.mockRejectedValue(err)
      await expect(
        service.create({ category: 'leasing', code: 'mtf', label: 'MTF' }),
      ).rejects.toBe(err)
    })
  })

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('missing', { label: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    // Category is the row's identity as far as the unique constraint goes; letting it move would
    // silently relabel a dropdown entry that vehicles already point at.
    it('ignores an attempt to change category', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf' })
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf', label: 'X' })
      await service.update('r1', { label: 'X', category: 'pool' } as never)
      expect(repo.update).toHaveBeenCalledWith('r1', { label: 'X' })
    })

    // The usage probe belongs to remove(), not update(). Deactivating a row 7 vehicles point at
    // must stay cheap and always succeed, so the assertion is that update() never probes at all --
    // without it, a future refactor could add a blocking usage check here and no test would notice.
    it('deactivating is always allowed even when the row is in use', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf' })
      repo.findOne.mockResolvedValueOnce({ id: 'r1', isActive: false })
      dataSource.query.mockResolvedValue([{ count: '7' }])
      await expect(service.update('r1', { isActive: false })).resolves.toBeDefined()
      // The resolved row comes from the second findOne mock whether or not repo.update ever ran,
      // so the patch has to be asserted directly or a dropped isActive line goes unnoticed.
      expect(repo.update).toHaveBeenCalledWith('r1', { isActive: false })
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    // update() copies the allow-list field by field, so any one dropped line silently discards that
    // column while every other field still saves. Pass all six at once so no line can go missing.
    it('carries every updatable field into the patch', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf' })
      repo.findOne.mockResolvedValueOnce({ id: 'r1' })
      await service.update('r1', {
        label: 'X',
        sortOrder: 3,
        isActive: false,
        warnDays: 30,
        defaultValidMonths: 12,
        isRequired: true,
      })
      expect(repo.update).toHaveBeenCalledWith('r1', {
        label: 'X',
        sortOrder: 3,
        isActive: false,
        warnDays: 30,
        defaultValidMonths: 12,
        isRequired: true,
      })
    })
  })

  describe('remove', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('deletes a row nothing references', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      dataSource.query.mockResolvedValue([{ count: '0' }])
      await service.remove('r1')
      expect(repo.delete).toHaveBeenCalledWith('r1')
    })

    // The 409 carries the count so the admin knows the size of what they would have broken,
    // and is told to deactivate instead.
    it('refuses to delete a row in use and reports how many reference it', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      // DEVIATION FROM BRIEF (see report): the brief drove this through
      // dataSource.query.mockResolvedValue([{ count: '3' }]), but REFERENCING_COLUMNS is empty in
      // Phase 1 so countUsage() short-circuits and never reaches dataSource.query -- that mock was
      // inert and remove() resolved. Stubbing countUsage is the only channel left that still
      // exercises the guard this test is named for. Phase 2 populates REFERENCING_COLUMNS and this
      // should revert to the brief's dataSource.query mock.
      jest.spyOn(service as never, 'countUsage').mockResolvedValue(3 as never)
      // /3/ alone would pass on a message that dropped the label and the "deactivate instead"
      // guidance, which is the whole point of the 409.
      await expect(service.remove('r1')).rejects.toThrow(/MTF.*3 record\(s\).*[Dd]eactivate/)
      expect(repo.delete).not.toHaveBeenCalled()
    })

    // Phase 1 has no referencing tables yet. The usage probe must therefore be a no-op that
    // reports zero, not a query against fleet_vehicles — which does not exist until Phase 2.
    it('reports zero usage without querying the database at all', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      await service.remove('r1')
      expect(dataSource.query).not.toHaveBeenCalled()
      expect(repo.delete).toHaveBeenCalledWith('r1')
    })
  })
})
