import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetDriversService } from './fleet-drivers.service'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'

describe('FleetDriversService', () => {
  let service: FleetDriversService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    createQueryBuilder: jest.Mock
  }
  let masterRepo: { findOne: jest.Mock }
  let qb: {
    where: jest.Mock
    andWhere: jest.Mock
    orderBy: jest.Mock
    addOrderBy: jest.Mock
    leftJoinAndSelect: jest.Mock
    getMany: jest.Mock
  }

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    }
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    }
    masterRepo = { findOne: jest.fn(async () => ({ id: 'sim-1', category: 'jenis_sim' })) }

    const module = await Test.createTestingModule({
      providers: [
        FleetDriversService,
        { provide: getRepositoryToken(FleetDriverEntity), useValue: repo },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: masterRepo },
      ],
    }).compile()
    service = module.get(FleetDriversService)
  })

  describe('findAll', () => {
    it('hides inactive drivers by default', async () => {
      await service.findAll()
      expect(qb.andWhere).toHaveBeenCalledWith('d.isActive = TRUE')
    })

    it('searches name, phone and licence number case-insensitively', async () => {
      await service.findAll('budi')
      const clause = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('ILIKE'))
      expect(clause).toBeDefined()
      expect(clause?.[1]).toEqual({ q: '%budi%' })
    })

    // Added beyond the brief's nine: the assertion above only proves *some* column is matched.
    // Without naming all three, narrowing the search to the name alone leaves the suite green
    // while the phone and licence-number search silently stop working.
    it('matches all three of nama, telepon and simNomor', async () => {
      await service.findAll('budi')
      const clause = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('ILIKE'))
      expect(clause?.[0]).toContain('d.nama ILIKE :q')
      expect(clause?.[0]).toContain('d.telepon ILIKE :q')
      expect(clause?.[0]).toContain('d.simNomor ILIKE :q')
    })

    it('includes inactive drivers when asked', async () => {
      await service.findAll(undefined, true)
      expect(qb.andWhere).not.toHaveBeenCalledWith('d.isActive = TRUE')
    })

    // Alphabetical order is the contract the driver dropdown in Task 6 relies on; nothing else
    // pins the direction, so a flip to DESC would go unnoticed.
    it('orders by name ascending', async () => {
      await service.findAll()
      expect(qb.orderBy).toHaveBeenCalledWith('d.nama', 'ASC')
    })
  })

  describe('create', () => {
    // The FK only proves the id exists in fleet_master_data — it cannot prove the row is a
    // licence class rather than a pool. Without this check a driver could be saved with
    // sim_jenis_id pointing at "Pool Cakung".
    it('rejects a simJenisId that is not a jenis_sim row', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ nama: 'Budi', simJenisId: '11111111-1111-1111-1111-111111111111' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // Added beyond the brief's nine: the mock returns a row whatever the `where` asks for, so
    // dropping `category: 'jenis_sim'` from the lookup leaves every other test green — the guard
    // would degrade into a plain existence check the FK already performs.
    it('looks the master row up by id AND jenis_sim category', async () => {
      await service.create({ nama: 'Budi', simJenisId: '11111111-1111-1111-1111-111111111111' })
      expect(masterRepo.findOne).toHaveBeenCalledWith({
        where: { id: '11111111-1111-1111-1111-111111111111', category: 'jenis_sim' },
      })
    })

    it('accepts a driver with no licence data at all', async () => {
      const row = await service.create({ nama: 'Budi' })
      expect(row).toMatchObject({ nama: 'Budi' })
      expect(masterRepo.findOne).not.toHaveBeenCalled()
    })

    it('trims the name', async () => {
      const row = await service.create({ nama: '  Budi Santoso  ' })
      expect(row).toMatchObject({ nama: 'Budi Santoso' })
    })
  })

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('missing', { nama: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      // Added beyond the brief's nine: the post-update re-read throws the same exception, so the
      // rejection alone does not prove the up-front guard exists. Deleting it would let an
      // unknown id issue a pointless UPDATE before failing — this is what pins the guard down.
      expect(repo.update).not.toHaveBeenCalled()
    })

    // null clears the licence class; an absent field leaves it alone. The service has to tell
    // those apart, which is why the DTO allows null explicitly.
    it('distinguishes clearing simJenisId from leaving it alone', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simJenisId: null })
      expect(repo.update).toHaveBeenCalledWith('d1', { simJenisId: null })

      repo.update.mockClear()
      await service.update('d1', { nama: 'Budi B' })
      expect(repo.update).toHaveBeenCalledWith('d1', { nama: 'Budi B' })
    })
  })

  describe('remove', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException)
    })

    // Phase 1 has no vehicles yet, so a delete is a real delete. Phase 2 changes this to archive
    // when a vehicle points at the driver.
    it('deletes the driver', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.remove('d1')
      expect(repo.delete).toHaveBeenCalledWith('d1')
    })
  })
})
