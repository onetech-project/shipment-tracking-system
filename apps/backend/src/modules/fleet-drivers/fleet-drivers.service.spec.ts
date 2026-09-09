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

    // The `if (q?.trim())` guard trims before testing, but the parameter it builds has to trim
    // too: a name pasted with a trailing space would search for '%  budi  %' and match nothing,
    // so the user sees an empty list. The test above passes an already-clean term and misses it.
    it('trims the search term before wrapping it in wildcards', async () => {
      await service.findAll('  budi  ')
      const clause = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('ILIKE'))
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

    // simJenis is the only source of the licence-class label the list renders, and the mock
    // returns the builder from every call, so dropping or misspelling the join relation leaves
    // every other findAll test green.
    it('hydrates the simJenis relation for the licence-class label', async () => {
      await service.findAll()
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('d.simJenis', 'sim')
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
      // The licence fields are asserted here too: absent input has to normalise to an explicit
      // null, otherwise `undefined` reaches TypeORM and the column keeps whatever a default says.
      expect(row).toMatchObject({ nama: 'Budi', simJenisId: null, simExpiresAt: null })
      expect(masterRepo.findOne).not.toHaveBeenCalled()
    })

    // The licence class and expiry are the reason the create form exists beyond the name. Nothing
    // else reads them back, so hardcoding either to null would persist a driver with no licence
    // while every other create test stayed green.
    it('persists the licence class and expiry it was given', async () => {
      const row = await service.create({
        nama: 'Budi',
        simJenisId: '11111111-1111-1111-1111-111111111111',
        simExpiresAt: '2027-01-31',
      })
      expect(row).toMatchObject({
        simJenisId: '11111111-1111-1111-1111-111111111111',
        simExpiresAt: '2027-01-31',
      })
    })

    it('trims the name', async () => {
      const row = await service.create({ nama: '  Budi Santoso  ' })
      expect(row).toMatchObject({ nama: 'Budi Santoso' })
    })

    // The update path pins what blankToNull does, but neither create call site was pinned: passing
    // the raw dto value straight through would persist '   ' in telepon or sim_nomor, and a
    // whitespace-only string is invisible to every IS NULL filter the list and alerts rely on.
    it('collapses a blanked telepon and simNomor to null', async () => {
      const row = await service.create({ nama: 'Budi', telepon: '   ', simNomor: '  ' })
      expect(row).toMatchObject({ telepon: null, simNomor: null })
    })

    // Every other blank test passes whitespace, never null -- yet null is what the client sends
    // to clear a column: the DTO types these `string | null` and @IsOptional skips validation for
    // null as well as undefined. A guard narrowed to undefined would call null.trim() and 500.
    it('accepts an explicit null telepon and simNomor', async () => {
      const row = await service.create({ nama: 'Budi', telepon: null, simNomor: null })
      expect(row).toMatchObject({ telepon: null, simNomor: null })
    })

    // Only the collapse-to-null branch was pinned. Handing the raw value back instead of the
    // trimmed one would store '  0812  ' verbatim -- invisible to exact-match lookups and to the
    // ILIKE '0812%' search the list runs.
    it('trims a telepon and simNomor it keeps', async () => {
      const row = await service.create({ nama: 'Budi', telepon: '  0812  ', simNomor: '  B1234  ' })
      expect(row).toMatchObject({ telepon: '0812', simNomor: 'B1234' })
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

    // The pool-row bug the create path already pins is reachable through PATCH as well: the FK
    // proves the id exists in fleet_master_data, not that the row is a licence class, so without
    // this lookup a driver could be repointed at "Pool Cakung" as their jenis SIM.
    it('validates a new simJenisId by id AND jenis_sim category', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simJenisId: '11111111-1111-1111-1111-111111111111' })
      expect(masterRepo.findOne).toHaveBeenCalledWith({
        where: { id: '11111111-1111-1111-1111-111111111111', category: 'jenis_sim' },
      })
    })

    // ...and the 400 has to surface from update, not just from create.
    it('rejects a simJenisId that is not a jenis_sim row', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.update('d1', { simJenisId: '11111111-1111-1111-1111-111111111111' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // The guard is truthy (`if (dto.simJenisId)`) rather than `!== undefined` on purpose: clearing
    // the licence class sends null, and there is no master row to look a null up against.
    it('skips the master lookup when the licence class is being cleared', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simJenisId: null })
      expect(masterRepo.findOne).not.toHaveBeenCalled()
    })

    // "Nonaktifkan" is the primary row action the driver list is built around. Nothing else proves
    // isActive ever reaches the patch object, so dropping it would leave the button silently inert.
    it('deactivates a driver', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi', isActive: true })
      await service.update('d1', { isActive: false })
      expect(repo.update).toHaveBeenCalledWith('d1', { isActive: false })
    })

    // Renewing a licence is the one write the expiry column exists for, and the partial index
    // idx_fleet_drivers_sim_expiry serves the expiry-alert query off it. Nothing else proved
    // simExpiresAt reaches the patch, so dropping the line — or clearing it to null — would let a
    // renewal silently no-op and leave the alert firing on the old date.
    it('records a renewed licence expiry', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simExpiresAt: '2027-01-31' })
      expect(repo.update).toHaveBeenCalledWith('d1', { simExpiresAt: '2027-01-31' })
    })

    // The create path trims; a rename through PATCH has to trim too, or the same driver sorts and
    // matches differently depending on which endpoint last wrote the name.
    it('trims a renamed driver', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { nama: '  Budi Santoso  ' })
      expect(repo.update).toHaveBeenCalledWith('d1', { nama: 'Budi Santoso' })
    })

    // '' and whitespace-only collapse to null so each optional column has one empty state rather
    // than two: an empty string stored here would be invisible to every IS NULL filter.
    it('collapses a blanked telepon to null', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { telepon: '   ' })
      expect(repo.update).toHaveBeenCalledWith('d1', { telepon: null })
    })

    // Same collapse, one column over: simNomor had no counterpart, so stripping its blankToNull
    // would store a whitespace-only licence number that no IS NULL filter can see.
    it('collapses a blanked simNomor to null', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simNomor: '   ' })
      expect(repo.update).toHaveBeenCalledWith('d1', { simNomor: null })
    })

    // The documented clear-the-column path sends an explicit null, not a blank string, and the
    // DTO types it that way on purpose. Nothing above reaches the null branch of the collapse,
    // so narrowing it to undefined would 500 on the one request it exists to serve.
    it('clears telepon and simNomor on an explicit null', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { telepon: null, simNomor: null })
      expect(repo.update).toHaveBeenCalledWith('d1', { telepon: null, simNomor: null })
    })

    // Same collapse seen from its other branch: a value that survives has to survive *trimmed*,
    // or a padded phone number is written straight to the column and no later search finds it.
    it('trims a telepon and simNomor it keeps', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { telepon: '  0812  ', simNomor: '  B1234  ' })
      expect(repo.update).toHaveBeenCalledWith('d1', { telepon: '0812', simNomor: 'B1234' })
    })

    // repo.findOne serves both the pre-existence check and the post-update re-read, so a single
    // mock value makes the two calls indistinguishable and the re-read free to vanish. Distinct
    // sequential values pin it: without the re-read a successful PATCH hands the edit form the
    // values the row had *before* the write, which reads as a save that silently failed.
    it('returns the row re-read after the update, not the pre-update one', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 'd1', nama: 'Budi' })
        .mockResolvedValueOnce({ id: 'd1', nama: 'Budi Santoso' })
      const row = await service.update('d1', { nama: 'Budi Santoso' })
      expect(repo.findOne).toHaveBeenCalledTimes(2)
      expect(row).toMatchObject({ nama: 'Budi Santoso' })
    })

    // Real TypeORM throws on an empty update value set, so an unconditional call would turn a
    // no-op PATCH into a 500 rather than returning the row untouched.
    it('issues no UPDATE at all for an empty patch', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      const row = await service.update('d1', {})
      expect(repo.update).not.toHaveBeenCalled()
      expect(row).toMatchObject({ id: 'd1', nama: 'Budi' })
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
