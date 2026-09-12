import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource, In, IsNull } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { severityFor, todayISO } from './fleet-severity'

// One live KIR, expiring in 5 days, on a type whose threshold is the default 30.
const docRow = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  vehicleId: 'v1',
  docTypeId: 'dt-kir',
  nomor: 'JKT-II/1',
  issuedAt: '2026-03-10',
  expiresAt: '2026-09-15',
  isCurrent: true,
  docType: { id: 'dt-kir', code: 'kir', label: 'KIR', warnDays: 30, sortOrder: 10 },
  ...over,
})

const vehicleRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  nopol: 'B9114KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: '8 ton',
  noRangka: null,
  noMesin: null,
  noBpkb: null,
  pemilikUnit: null,
  odometer: 120000,
  catatan: null,
  jenisArmadaId: 'ja-1',
  jenisArmada: { id: 'ja-1', label: 'Colt Diesel Engkel' },
  kepemilikanId: null,
  kepemilikan: null,
  poolId: null,
  pool: null,
  statusId: null,
  status: null,
  driverId: 'dr-1',
  driver: {
    id: 'dr-1',
    nama: 'Ahmad Fauzi',
    simExpiresAt: '2027-03-14',
    simJenis: { id: 'sj-1', label: 'B2 Umum', warnDays: 30 },
  },
  isActive: true,
  ...over,
})

const severityFromDays = (daysLeft: number | null) => severityFor(daysLeft, 30)

// Dates expressed relative to the same Jakarta business day the service measures against, so a
// case that depends on an exact daysLeft stays true whatever day the suite runs on.
const inDays = (n: number) =>
  new Date(Date.parse(`${todayISO()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

describe('FleetVehiclesService', () => {
  let service: FleetVehiclesService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    count: jest.Mock
    createQueryBuilder: jest.Mock
  }
  let docRepo: { find: jest.Mock; count: jest.Mock; createQueryBuilder: jest.Mock }
  let leaseRepo: { find: jest.Mock }
  let masterRepo: { findOne: jest.Mock; find: jest.Mock }
  let dataSource: { transaction: jest.Mock }
  let idQb: Record<string, jest.Mock>
  let docQb: Record<string, jest.Mock>
  let txManager: {
    update: jest.Mock
    insert: jest.Mock
    save: jest.Mock
    create: jest.Mock
    findOne: jest.Mock
  }

  beforeEach(async () => {
    idQb = {
      select: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => 1),
      getRawMany: jest.fn(async () => [{ id: 'v1' }]),
    }
    docQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [docRow()]),
    }
    repo = {
      find: jest.fn(async () => [vehicleRow()]),
      findOne: jest.fn(async () => vehicleRow()),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'v-new', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(() => idQb),
    }
    docRepo = {
      find: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(() => docQb),
    }
    masterRepo = {
      findOne: jest.fn(async (opts: { where: { id: string; category: string } }) => {
        const { id, category } = opts.where
        if (category === 'kepemilikan') return { id, category, code: 'milik_gms' }
        return { id, category }
      }),
      find: jest.fn(async () => []),
    }
    leaseRepo = { find: jest.fn(async () => []) }
    txManager = {
      update: jest.fn(),
      insert: jest.fn(),
      save: jest.fn(async (_e, v) => ({ id: 'v-new', ...(v as object) })),
      create: jest.fn((_e, v) => v),
      findOne: jest.fn(async () => null),
    }
    dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(txManager)) }

    const module = await Test.createTestingModule({
      providers: [
        FleetVehiclesService,
        { provide: getRepositoryToken(FleetVehicleEntity), useValue: repo },
        { provide: getRepositoryToken(FleetVehicleDocumentEntity), useValue: docRepo },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: masterRepo },
        { provide: getRepositoryToken(FleetLeaseContractEntity), useValue: leaseRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile()
    service = module.get(FleetVehiclesService)
  })

  const andWhereCall = (needle: string) =>
    idQb.andWhere.mock.calls.find((c) => String(c[0]).includes(needle))

  describe('findAll', () => {
    it('hides archived units by default', async () => {
      await service.findAll({})
      expect(andWhereCall('v.isActive')).toBeDefined()
    })

    it('includes archived units when asked', async () => {
      await service.findAll({ includeArchived: true })
      expect(andWhereCall('v.isActive')).toBeUndefined()
    })

    // The search spans the plate, the make/model, both chassis numbers and the driver's name —
    // an operator holding a delivery note has one of those, not a UUID.
    it('searches plate, make, type, chassis, engine and driver name', async () => {
      await service.findAll({ q: 'canter' })
      const clause = andWhereCall('ILIKE')
      const sql = String(clause?.[0])
      expect(sql).toContain('v.nopol')
      expect(sql).toContain('v.merk')
      expect(sql).toContain('v.tipe')
      expect(sql).toContain('v.noRangka')
      expect(sql).toContain('v.noMesin')
      expect(sql).toContain('dr.nama')
    })

    // Plates are stored closed-up but operators type them spaced, the way they read off the
    // vehicle. Comparing the stripped column against the stripped term is what keeps "B 9114"
    // finding B9114KYZ; without it the search box silently returns nothing for the one format
    // every operator actually types.
    it('matches the plate with separators stripped from both sides', async () => {
      await service.findAll({ q: 'b 9114' })
      const clause = andWhereCall('ILIKE')
      // Asserted as one whole comparison rather than as loose facts, because the parts only fix
      // the bug together: comparing the stripped column against :q restores it, a character class
      // that is not the separators strips nothing useful, and without the 'g' flag only the first
      // separator goes, so a two-space plate like "B 13 23OE" still finds nothing.
      expect(String(clause?.[0])).toContain(
        "regexp_replace(v.nopol, '[[:space:].-]', '', 'g') ILIKE :qNopol",
      )
      expect(clause?.[1]).toEqual({ q: '%b 9114%', qNopol: '%B9114%' })
    })

    // Only the plate is stripped. Doing it to merk as well would make "Colt Diesel" match
    // "ColtDiesel" and, worse, make the driver name search ignore the spaces that separate names.
    it('leaves the other columns matching the term as typed', async () => {
      await service.findAll({ q: 'b 9114' })
      const sql = String(andWhereCall('ILIKE')?.[0])
      for (const column of ['v.merk', 'v.tipe', 'v.noRangka', 'v.noMesin', 'dr.nama']) {
        // \b after :q so the as-typed parameter is not satisfied by :qNopol, which starts with it.
        expect(sql).toMatch(new RegExp(`${column.replace('.', '\\.')} ILIKE :q\\b`))
      }
      // The plate is the only column allowed to be stripped, so exactly one call may appear —
      // naming the five columns alone would not notice a sixth stripped comparison appearing.
      expect(sql.match(/regexp_replace/g)).toHaveLength(1)
    })

    it('ignores a whitespace-only search term', async () => {
      await service.findAll({ q: '   ' })
      expect(andWhereCall('ILIKE')).toBeUndefined()
    })

    // Severity has to be a SQL predicate, not a client-side filter: filtering after pagination
    // would return "3 of 8" on a page that happens to hold three expired units and hide the rest.
    it('filters crit as severity_rank 0', async () => {
      await service.findAll({ severity: 'crit' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 0')
    })

    it('filters warn as severity_rank 1', async () => {
      await service.findAll({ severity: 'warn' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 1')
    })

    it('filters ok as severity_rank 2', async () => {
      await service.findAll({ severity: 'ok' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 2')
    })

    // A vehicle with no dated document produces no row in the view at all, so "none" is an
    // IS NULL test rather than a fourth rank. Getting this wrong returns an empty page and
    // looks like there are no such vehicles.
    it('filters none as a missing view row', async () => {
      await service.findAll({ severity: 'none' })
      expect(andWhereCall('vs.vehicle_id IS NULL')).toBeDefined()
    })

    it('filters by ownership, pool and status ids', async () => {
      await service.findAll({ kepemilikanId: 'k1', poolId: 'p1', statusId: 's1' })
      expect(andWhereCall('v.kepemilikanId')?.[1]).toEqual({ kepemilikanId: 'k1' })
      expect(andWhereCall('v.poolId')?.[1]).toEqual({ poolId: 'p1' })
      expect(andWhereCall('v.statusId')?.[1]).toEqual({ statusId: 's1' })
    })

    it('defaults to ordering by plate', async () => {
      await service.findAll({})
      expect(idQb.orderBy).toHaveBeenCalledWith('v.nopol', 'ASC')
    })

    it('sorts by plate descending', async () => {
      await service.findAll({ sort: '-nopol' })
      expect(idQb.orderBy).toHaveBeenCalledWith('v.nopol', 'DESC')
    })

    it('sorts by year oldest-first', async () => {
      await service.findAll({ sort: 'tahun' })
      expect(idQb.orderBy).toHaveBeenCalledWith('v.tahun', 'ASC')
      expect(idQb.addOrderBy).toHaveBeenCalledWith('v.nopol', 'ASC')
    })

    // tahun is nullable and Postgres puts NULLs FIRST on DESC, so without the COALESCE "tahun
    // terbaru" opens on every unit whose year was never recorded instead of the newest ones.
    it('sorts by year newest-first with undated units last', async () => {
      await service.findAll({ sort: '-tahun' })
      expect(idQb.orderBy).toHaveBeenCalledWith('COALESCE(v.tahun, 0)', 'DESC')
      expect(idQb.addOrderBy).toHaveBeenCalledWith('v.nopol', 'ASC')
    })

    // Vehicles with no view row must sort last, not first: COALESCE to 3 puts 'none' behind
    // 'ok'. Without it NULLs would lead the list and bury the expired units the sort exists for.
    it('sorts by severity worst-first with unknown units last', async () => {
      await service.findAll({ sort: 'severity' })
      const [expr, dir] = idQb.orderBy.mock.calls[0]
      expect(String(expr)).toContain('COALESCE(vs.severity_rank, 3)')
      expect(dir).toBe('ASC')
    })

    // The rank alone leaves every unit inside a bucket in arbitrary order. The min_days_left
    // tiebreaker is what puts the most urgent unit at the top of its own severity band.
    it('breaks severity ties by the nearest expiry before the plate', async () => {
      await service.findAll({ sort: 'severity' })
      expect(idQb.addOrderBy.mock.calls).toEqual([
        ['vs.min_days_left', 'ASC'],
        ['v.nopol', 'ASC'],
      ])
    })

    it('paginates with the requested page and size', async () => {
      await service.findAll({ page: 3, pageSize: 10 })
      expect(idQb.offset).toHaveBeenCalledWith(20)
      expect(idQb.limit).toHaveBeenCalledWith(10)
    })

    it('defaults to page 1 of 25', async () => {
      const res = await service.findAll({})
      expect(idQb.offset).toHaveBeenCalledWith(0)
      expect(idQb.limit).toHaveBeenCalledWith(25)
      expect(res.page).toBe(1)
      expect(res.pageSize).toBe(25)
    })

    // Without the cap a client asking for pageSize=100000 makes the server materialise the
    // whole register and every document on it in one response.
    it('caps the page size at 100', async () => {
      await service.findAll({ pageSize: 5000 })
      expect(idQb.limit).toHaveBeenCalledWith(100)
    })

    it('reports the unpaginated total', async () => {
      idQb.getCount.mockResolvedValue(87)
      const res = await service.findAll({})
      expect(res.total).toBe(87)
    })

    // The id query answers "which vehicles and in what order"; loading them by id would lose
    // that order, so the mapper reorders to match. Without it the severity sort silently
    // degrades to whatever order Postgres returns.
    it('returns rows in the order the id query produced', async () => {
      idQb.getRawMany.mockResolvedValue([{ id: 'v2' }, { id: 'v1' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v1' }), vehicleRow({ id: 'v2' })])
      docQb.getMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows.map((r) => r.id)).toEqual(['v2', 'v1'])
    })

    it('skips both follow-up queries when no vehicle matched', async () => {
      idQb.getRawMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows).toEqual([])
      expect(repo.find).not.toHaveBeenCalled()
      expect(docRepo.createQueryBuilder).not.toHaveBeenCalled()
    })

    // One document query for the whole page. Per-vehicle loading is 25 extra round trips on the
    // default page and gets worse as the register grows.
    it('loads the whole page of documents in a single query', async () => {
      idQb.getRawMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v1' }), vehicleRow({ id: 'v2' })])
      await service.findAll({})
      expect(docRepo.createQueryBuilder).toHaveBeenCalledTimes(1)
      expect(docQb.where.mock.calls[0][1]).toEqual({ ids: ['v1', 'v2'] })
    })

    it('asks only for live documents', async () => {
      await service.findAll({})
      expect(docQb.andWhere).toHaveBeenCalledWith('d.isCurrent = TRUE')
    })
  })

  describe('create', () => {
    beforeEach(() => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow(),
      )
      idQb.getRawMany.mockResolvedValue([{ id: 'v-new' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v-new' })])
    })

    it('stores the plate normalised', async () => {
      await service.create({ nopol: 'b  9114   kyz' })
      expect(txManager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ nopol: 'B9114KYZ' }),
      )
    })

    it('rejects a blank plate', async () => {
      await expect(service.create({ nopol: '   ' })).rejects.toBeInstanceOf(BadRequestException)
    })

    // The plate is what an operator recognises a unit by; two live rows sharing one make the
    // register ambiguous at exactly the moment it is consulted.
    it('refuses a plate an active vehicle already holds', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ id: 'other' }))
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('checks the clash against live units only', async () => {
      await service.create({ nopol: 'B9114KYZ' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect((clashCall?.[0] as { where: Record<string, unknown> }).where).toMatchObject({
        nopol: 'B9114KYZ',
        isActive: true,
      })
    })

    // The FK only proves the row exists. Without the category check a vehicle saves happily with
    // pool_id pointing at a leasing company, and the pool filter then never finds it.
    it('rejects a master id from the wrong category', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ nopol: 'B1A', poolId: 'not-a-pool' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('checks each master field against its own category', async () => {
      await service.create({
        nopol: 'B1A',
        jenisArmadaId: 'ja-1',
        kepemilikanId: 'kp-1',
        poolId: 'pl-1',
        statusId: 'st-1',
      })
      const categories = masterRepo.findOne.mock.calls.map(
        (c) => (c[0] as { where: { category: string } }).where.category,
      )
      // The trailing kepemilikan probe is assertOwnerNamedWhenRented reading the code it
      // branches on, which the FK cannot express.
      expect(categories).toEqual([
        'jenis_armada',
        'kepemilikan',
        'pool',
        'status_kendaraan',
        'kepemilikan',
      ])
    })

    it('collapses blank optional text to null', async () => {
      await service.create({ nopol: 'B1A', merk: '   ', catatan: '' })
      expect(txManager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ merk: null, catatan: null }),
      )
    })

    // The check-then-act above still loses a race. Surfacing the constraint violation as the same
    // 409 keeps the two paths indistinguishable to the client rather than leaking a 500.
    it('translates a concurrent unique violation into a conflict', async () => {
      txManager.save.mockRejectedValue({
        code: '23505',
        constraint: 'uq_fleet_vehicles_nopol_active',
      })
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('rethrows an unrelated database error untouched', async () => {
      txManager.save.mockRejectedValue({ code: '23503', constraint: 'fk_fleet_vehicles_pool' })
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.not.toBeInstanceOf(
        ConflictException,
      )
    })

    // The plate index is not the only unique index this module can trip —
    // uq_fleet_vehicle_documents_current raises 23505 too. Matching on the code alone would
    // report any of them to the operator as a duplicate licence plate.
    it('rethrows a unique violation from a different constraint untouched', async () => {
      const err = { code: '23505', constraint: 'uq_fleet_vehicle_documents_current' }
      txManager.save.mockRejectedValue(err)
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toBe(err)
    })
  })

  describe('update', () => {
    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('nope', { merk: 'Hino' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    // An absent key means "leave it alone" and an explicit null means "clear it". A spread of the
    // DTO would write undefined over every untouched column.
    it('patches only the fields present in the payload', async () => {
      await service.update('v1', { merk: 'Hino' })
      expect(txManager.update).toHaveBeenCalledWith(expect.anything(), 'v1', { merk: 'Hino' })
    })

    it('clears a column when the payload sends null', async () => {
      await service.update('v1', { odometer: null })
      expect(txManager.update).toHaveBeenCalledWith(expect.anything(), 'v1', { odometer: null })
    })

    // Asserted against the transaction rather than the repository: with nothing to patch, no
    // lease and no documents, update must not open one at all.
    it('skips the write entirely for an empty payload', async () => {
      await service.update('v1', {})
      expect(dataSource.transaction).not.toHaveBeenCalled()
      expect(txManager.update).not.toHaveBeenCalled()
    })

    // Re-checking on every update would reject a vehicle for colliding with itself. Only a
    // changed plate needs the probe.
    it('does not re-check the plate when it is unchanged', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ nopol: 'B9114KYZ' }))
      await service.update('v1', { nopol: 'b 9114 kyz' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect(clashCall).toBeUndefined()
    })

    it('checks a changed plate against other live units', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ nopol: 'B9114KYZ' }))
        .mockResolvedValueOnce(vehicleRow({ id: 'other', nopol: 'B2XX' }))
      await expect(service.update('v1', { nopol: 'B2XX' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('normalises a changed plate before storing it', async () => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow({ nopol: 'B9114KYZ' }),
      )
      await service.update('v1', { nopol: 'b   2   xx' })
      expect(txManager.update).toHaveBeenCalledWith(expect.anything(), 'v1', { nopol: 'B2XX' })
    })
  })

  describe('archive and restore', () => {
    it('archives by clearing the registration flag', async () => {
      await service.archive('v1')
      expect(repo.update).toHaveBeenCalledWith('v1', { isActive: false })
    })

    it('404s when archiving a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.archive('nope')).rejects.toBeInstanceOf(NotFoundException)
    })

    // While a unit sat archived another may have taken its plate. Restoring blindly would hit
    // the partial unique index and surface as a 500.
    it('refuses to restore into a plate another live unit has taken', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(vehicleRow({ id: 'other' }))
      await expect(service.restore('v1')).rejects.toBeInstanceOf(ConflictException)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('restores when the plate is still free', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(null)
      await service.restore('v1')
      expect(repo.update).toHaveBeenCalledWith('v1', { isActive: true })
    })

    // The exclusion is what stops a vehicle colliding with its own row.
    it('excludes the vehicle itself from the restore probe', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(null)
      await service.restore('v1')
      const probe = repo.findOne.mock.calls[1][0] as { where: Record<string, unknown> }
      expect(probe.where.id).toBeDefined()
    })
  })

  describe('remove', () => {
    it('hard-deletes a vehicle with no history', async () => {
      docRepo.count.mockResolvedValue(0)
      await service.remove('v1')
      expect(repo.delete).toHaveBeenCalledWith('v1')
    })

    // A mistyped row should be cleanable, but a unit with documents disappearing takes its
    // renewal history with it — archiving is what that case wants.
    it('refuses to delete a vehicle that has documents', async () => {
      docRepo.count.mockResolvedValue(3)
      await expect(service.remove('v1')).rejects.toBeInstanceOf(ConflictException)
      expect(repo.delete).not.toHaveBeenCalled()
    })

    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('replaceDocuments', () => {
    beforeEach(() => {
      masterRepo.findOne.mockResolvedValue({ id: 'dt-kir', category: 'jenis_dokumen' })
    })

    // Retire-then-insert has to be atomic: a crash between the two halves would leave the vehicle
    // with no live documents at all and every badge reading 'none'.
    it('runs the swap inside one transaction', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir', expiresAt: '2027-01-01' }])
      expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('retires the existing live rows before inserting', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir', expiresAt: '2027-01-01' }])
      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(),
        { vehicleId: 'v1', isCurrent: true },
        { isCurrent: false },
      )
      const updateOrder = txManager.update.mock.invocationCallOrder[0]
      const insertOrder = txManager.insert.mock.invocationCallOrder[0]
      expect(updateOrder).toBeLessThan(insertOrder)
    })

    it('inserts each submitted document as the live row', async () => {
      await service.replaceDocuments('v1', [
        { docTypeId: 'dt-kir', nomor: 'JKT-1', issuedAt: '2026-03-10', expiresAt: '2026-09-15' },
      ])
      expect(txManager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          vehicleId: 'v1',
          docTypeId: 'dt-kir',
          nomor: 'JKT-1',
          issuedAt: '2026-03-10',
          expiresAt: '2026-09-15',
          isCurrent: true,
        }),
      )
    })

    // A document number left blank on the form must land as null, not as '', so the column has
    // one empty state the way every other optional text column on this module does.
    it('collapses a blank document number to null', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir', nomor: '   ' }])
      expect(txManager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ nomor: null }),
      )
    })

    // Two rows of the same type in one payload would both insert as current and violate
    // uq_fleet_vehicle_documents_current — a 500 where a 400 naming the type is the right answer.
    it('rejects a payload carrying the same type twice', async () => {
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'dt-kir' }, { docTypeId: 'dt-kir' }]),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('rejects a doc type id that is not a jenis_dokumen row', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'pool-1' }]),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // The category is what the FK cannot express: fleet_vehicle_documents.doc_type_id accepts any
    // fleet_master_data row, so without this probe a "Pool Cakung" row saves as a document type
    // and then feeds the vehicle's severity through the view's join on fleet_master_data.
    it('probes the doc type against the jenis_dokumen category and nothing else', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir' }])
      expect(masterRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'dt-kir', category: 'jenis_dokumen' },
      })
    })

    it('rejects the payload before opening a transaction', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'pool-1' }]),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    // An empty set is a legitimate submission — it retires everything and leaves the vehicle
    // with no live documents.
    it('accepts an empty set and only retires', async () => {
      await service.replaceDocuments('v1', [])
      expect(txManager.update).toHaveBeenCalled()
      expect(txManager.insert).not.toHaveBeenCalled()
    })

    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.replaceDocuments('nope', [])).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('view mapping', () => {
    it('computes severity per document from its own threshold', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ expiresAt: '2026-09-15', docType: { id: 'dt-kir', code: 'kir', label: 'KIR', warnDays: 30, sortOrder: 10 } }),
      ])
      const res = await service.findAll({})
      const doc = res.rows[0].documents[0]
      expect(doc.severity).toBe(severityFromDays(doc.daysLeft))
    })

    // The worst document decides the row badge — an operator scanning the list needs the row to
    // shout when any single paper has lapsed.
    it('reports the worst document severity on the row', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: '2020-01-01' }),
        docRow({ id: 'd2', expiresAt: '2030-01-01' }),
      ])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('crit')
    })

    it('reports none and a null minDaysLeft for a vehicle with no dated documents', async () => {
      docQb.getMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('none')
      expect(res.rows[0].minDaysLeft).toBeNull()
    })

    it('reports the nearest expiry as minDaysLeft', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: '2030-01-01' }),
        docRow({ id: 'd2', expiresAt: '2020-01-01' }),
      ])
      const res = await service.findAll({})
      const nearest = Math.min(...res.rows[0].documents.map((d) => d.daysLeft as number))
      expect(res.rows[0].minDaysLeft).toBe(nearest)
    })

    // Documents with no expiry date must not drag minDaysLeft to null or to a bogus number.
    it('ignores undated documents when computing minDaysLeft', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: null }),
        docRow({ id: 'd2', expiresAt: '2030-01-01' }),
      ])
      const res = await service.findAll({})
      expect(res.rows[0].minDaysLeft).not.toBeNull()
    })

    // worstSeverity and minDaysLeft are two independent aggregates and routinely come from two
    // different documents, exactly as the view's MIN(severity_rank) and MIN(min_days_left) do.
    // A service certificate 20 days out against a 14-day threshold is still 'ok' while a KIR 25
    // days out against a 30-day threshold is 'warn': the badge comes from the KIR, the number
    // from the certificate. They must stay two facts, never one claim about one document.
    it('derives worstSeverity and minDaysLeft from different documents when they diverge', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({
          id: 'd1',
          expiresAt: inDays(20),
          docType: { id: 'dt-srv', code: 'servis', label: 'Servis', warnDays: 14, sortOrder: 20 },
        }),
        docRow({
          id: 'd2',
          expiresAt: inDays(25),
          docType: { id: 'dt-kir', code: 'kir', label: 'KIR', warnDays: 30, sortOrder: 10 },
        }),
      ])
      const res = await service.findAll({})
      const row = res.rows[0]
      expect(row.documents.map((d) => d.severity)).toEqual(['ok', 'warn'])
      expect(row.worstSeverity).toBe('warn')
      expect(row.minDaysLeft).toBe(20)
    })

    // A document whose expiry date is today is still valid for the rest of the business day, so
    // it is warn with daysLeft 0 — crit starts tomorrow. This mirrors the view's
    // `WHEN d.expires_at < today THEN 0`; if the two drift, the ?severity= filter and the badge
    // it produced disagree on the same row.
    it('treats a document expiring today as warn, not crit', async () => {
      docQb.getMany.mockResolvedValue([docRow({ id: 'd1', expiresAt: inDays(0) })])
      const res = await service.findAll({})
      expect(res.rows[0].documents[0].daysLeft).toBe(0)
      expect(res.rows[0].documents[0].severity).toBe('warn')
      expect(res.rows[0].worstSeverity).toBe('warn')
    })

    it('treats a document that expired yesterday as crit', async () => {
      docQb.getMany.mockResolvedValue([docRow({ id: 'd1', expiresAt: inDays(-1) })])
      const res = await service.findAll({})
      expect(res.rows[0].documents[0].daysLeft).toBe(-1)
      expect(res.rows[0].worstSeverity).toBe('crit')
    })

    it('projects the driver with its own licence severity', async () => {
      const res = await service.findAll({})
      expect(res.rows[0].driver).toMatchObject({ id: 'dr-1', nama: 'Ahmad Fauzi' })
      expect(res.rows[0].driver?.simSeverity).toBeDefined()
    })

    // A licence class with no threshold of its own falls back to the module default of 30 days,
    // the same way a document type does. Falling back to 0 instead would leave a licence
    // expiring in ten days reading 'ok' right up to the day it lapses.
    it('falls back to the default licence threshold when the class carries none', async () => {
      repo.find.mockResolvedValue([
        vehicleRow({
          driver: {
            id: 'dr-1',
            nama: 'Ahmad Fauzi',
            simExpiresAt: inDays(10),
            simJenis: null,
          },
        }),
      ])
      const res = await service.findAll({})
      expect(res.rows[0].driver?.simDaysLeft).toBe(10)
      expect(res.rows[0].driver?.simSeverity).toBe('warn')
    })

    // The licence belongs to the person, so it must not colour the vehicle's document badge.
    // Phase 4's alert list is where the two streams merge.
    it('leaves the licence out of the vehicle badge', async () => {
      repo.find.mockResolvedValue([
        vehicleRow({
          driver: {
            id: 'dr-1',
            nama: 'Ahmad Fauzi',
            simExpiresAt: '2020-01-01',
            simJenis: { id: 'sj-1', label: 'B2', warnDays: 30 },
          },
        }),
      ])
      docQb.getMany.mockResolvedValue([docRow({ expiresAt: '2030-01-01' })])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('ok')
      expect(res.rows[0].driver?.simSeverity).toBe('crit')
    })

    it('emits null rather than an empty object for a vehicle with no driver', async () => {
      repo.find.mockResolvedValue([vehicleRow({ driverId: null, driver: null })])
      const res = await service.findAll({})
      expect(res.rows[0].driver).toBeNull()
    })

    it('flattens master rows to id and label', async () => {
      const res = await service.findAll({})
      expect(res.rows[0].jenisArmada).toEqual({ id: 'ja-1', label: 'Colt Diesel Engkel' })
      expect(res.rows[0].pool).toBeNull()
    })
  })


  describe('create with lease and documents', () => {
    beforeEach(() => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow(),
      )
      idQb.getRawMany.mockResolvedValue([{ id: 'v-new' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v-new' })])
    })

    const payload = () => ({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter',
      lease: {
        leasingId: 'ls-1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: 4,
      },
      documents: [{ docTypeId: 'dt-kir', nomor: 'JKT-II/1', expiresAt: inDays(30) }],
    })

    // The point of the combined endpoint: one operator action is one transaction. Saving the
    // vehicle outside it would leave a unit registered with no papers whenever the document
    // insert fails, and nothing on screen to say which half went in.
    it('writes the vehicle, the contract and the documents in one transaction', async () => {
      await service.create(payload())
      expect(dataSource.transaction).toHaveBeenCalledTimes(1)
      expect(repo.save).not.toHaveBeenCalled()
      expect(txManager.save).toHaveBeenCalled()
      expect(txManager.insert).toHaveBeenCalled()
    })

    // Spec §8 pins this explicitly. The assertion is that the failure propagates rather than
    // being swallowed — the rollback itself is the transaction's job, and letting the error out
    // is what triggers it.
    it('lets a document failure abort the whole save', async () => {
      txManager.insert.mockRejectedValueOnce(new Error('insert failed'))
      await expect(service.create(payload())).rejects.toThrow('insert failed')
    })

    it('stores the contract against the vehicle it just created', async () => {
      await service.create(payload())
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ vehicleId: 'v-new', leasingId: 'ls-1' })
    })

    // The override column carries the operator's answer; the DTO field is named for what the
    // operator sees. Wiring one to the other by the wrong name silently discards the override
    // and the figure reverts to the derived one on the next read.
    it('stores angsuranTerbayar in the override column', async () => {
      await service.create(payload())
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ angsuranTerbayarOverride: 4 })
    })

    it('leaves the override null when the operator left the field blank', async () => {
      const dto = payload()
      dto.lease.angsuranTerbayar = undefined as unknown as number
      await service.create(dto)
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ angsuranTerbayarOverride: null })
    })

    it('saves a vehicle with no lease at all', async () => {
      const dto = payload()
      dto.lease = null as never
      await service.create(dto)
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall).toBeUndefined()
    })

    // Requirement §2: a rented unit's owner is someone outside the company, and a register that
    // does not name them cannot answer who to return the truck to.
    it('rejects a sewa lepas kunci unit with no pemilikUnit', async () => {
      masterRepo.findOne.mockImplementation(async (opts: { where: { id: string; category: string } }) =>
        opts.where.category === 'kepemilikan'
          ? { id: opts.where.id, category: 'kepemilikan', code: 'sewa_lepas_kunci' }
          : { id: opts.where.id, category: opts.where.category },
      )
      await expect(
        service.create({ ...payload(), kepemilikanId: 'kp-sewa', pemilikUnit: null }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a sewa lepas kunci unit that names its owner', async () => {
      masterRepo.findOne.mockImplementation(async (opts: { where: { id: string; category: string } }) =>
        opts.where.category === 'kepemilikan'
          ? { id: opts.where.id, category: 'kepemilikan', code: 'sewa_lepas_kunci' }
          : { id: opts.where.id, category: opts.where.category },
      )
      await expect(
        service.create({ ...payload(), kepemilikanId: 'kp-sewa', pemilikUnit: 'CV Andalan' }),
      ).resolves.toBeDefined()
    })

    // A spaces-only name is not a name. The guard trims before it decides, or an operator clears
    // the field with the space bar and the register still cannot say who the truck goes back to.
    it('rejects a sewa lepas kunci unit whose pemilikUnit is only whitespace', async () => {
      masterRepo.findOne.mockImplementation(async (opts: { where: { id: string; category: string } }) =>
        opts.where.category === 'kepemilikan'
          ? { id: opts.where.id, category: 'kepemilikan', code: 'sewa_lepas_kunci' }
          : { id: opts.where.id, category: opts.where.category },
      )
      await expect(
        service.create({ ...payload(), kepemilikanId: 'kp-sewa', pemilikUnit: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // A company-owned unit has no external owner to name, so demanding one would block every
    // normal registration.
    it('does not demand pemilikUnit for a company-owned unit', async () => {
      await expect(service.create({ ...payload(), pemilikUnit: null })).resolves.toBeDefined()
    })
  })

  describe('update with a replacement lease', () => {
    // A refinanced unit gets a new contract; the old one is closed, not overwritten. Overwriting
    // is what the prototype did, and it is why no unit there could show what it used to pay.
    it('closes the open contract instead of overwriting it', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', {
        lease: {
          leasingId: 'ls-2',
          nomorKontrak: 'MTF-2',
          cicilanPerBulan: 9000000,
          tenorBulan: 24,
          angsuranMulai: '2026-06-01',
        },
      })
      const closeCall = txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])
      expect(closeCall?.[2].closedAt).toEqual(expect.any(String))
    })

    it('opens the replacement contract in the same transaction', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', {
        lease: {
          leasingId: 'ls-2',
          nomorKontrak: 'MTF-2',
          cicilanPerBulan: 9000000,
          tenorBulan: 24,
          angsuranMulai: '2026-06-01',
        },
      })
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall?.[1]).toMatchObject({ nomorKontrak: 'MTF-2', closedAt: null })
    })

    // An explicit null is the operator saying the unit is no longer financed. Leaving the old
    // contract open would keep reporting instalments on a truck that is paid off.
    it('closes the contract and opens no replacement when lease is null', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', { lease: null })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall).toBeUndefined()
    })

    // Absent means "leave it alone" — the same patch semantics every other field has. A PATCH
    // that only bumps the odometer must not close the lease.
    it('leaves the contract untouched when lease is absent', async () => {
      await service.update('v1', { odometer: 130000 })
      expect(txManager.findOne).not.toHaveBeenCalled()
    })
  })

  describe('lease view', () => {
    // The view carries figures, not raw columns: the frontend renders sisaKewajiban and must
    // never be the place that multiplies it out (spec §5.2).
    it('reports the instalments paid, remaining and still owed', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: 'ls-1',
        leasing: { id: 'ls-1', label: 'MTF' },
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: 4,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease).toMatchObject({
        nomorKontrak: 'MTF-1',
        angsuranTerbayar: 4,
        sisaAngsuran: 32,
        sisaKewajiban: 32 * 8750000,
      })
    })

    // numeric columns come back from pg as strings. Left as one, cicilanPerBulan * sisaAngsuran
    // in any consumer becomes string repetition or NaN.
    it('hands back the instalment amount as a number', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: null,
        leasing: null,
        nomorKontrak: null,
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: 4,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease?.cicilanPerBulan).toBe(8750000)
    })

    // The derived count and the typed one are reported separately. Collapsed into one field, the
    // edit form cannot tell "the operator said four" from "four months have passed", and saving
    // an untouched form would pin a rising count in place.
    it('distinguishes an override the operator typed from a derived count', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: null,
        leasing: null,
        nomorKontrak: null,
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: null,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease?.angsuranTerbayarOverride).toBeNull()
      expect(typeof view.lease?.angsuranTerbayar).toBe('number')
    })

    // Closed contracts are history with no figures to report. Without the closedAt filter a
    // refinanced unit returns every contract it ever had and the by-vehicle map keeps whichever
    // row arrived last — quite possibly the one that was paid off years ago.
    it('asks only for the contract still open on the unit', async () => {
      await service.findOne('v1')
      const where = leaseRepo.find.mock.calls[0][0].where
      expect(where.closedAt).toEqual(IsNull())
      expect(where.vehicleId).toEqual(In(['v1']))
    })

    it('reports no lease for a unit that has no open contract', async () => {
      leaseRepo.find.mockResolvedValueOnce([])
      const view = await service.findOne('v1')
      expect(view.lease).toBeNull()
    })
  })


  // Exception A. The form posts the lease block on every save, so "the key is present" cannot be
  // read as "the operator refinanced the unit". Without a substance comparison, saving a vehicle
  // after editing only its odometer would close the open contract and open an identical
  // replacement — a closed row per save, burying the credit history the closing mechanism exists
  // to keep.
  describe('update with an unchanged lease', () => {
    // The shape pg actually returns: numeric as a string, date as a Date. A === against the DTO's
    // JSON numbers and ISO strings reports "different" on every field and reproduces the bug.
    const openRow = (over: Record<string, unknown> = {}) => ({
      id: 'lc-open',
      vehicleId: 'v1',
      leasingId: 'ls-1',
      nomorKontrak: 'MTF-1',
      cicilanPerBulan: '8750000.00',
      tenorBulan: 36,
      angsuranMulai: new Date('2026-01-10T00:00:00Z'),
      angsuranTerbayarOverride: 4,
      closedAt: null,
      ...over,
    })

    const samePayload = () => ({
      leasingId: 'ls-1',
      nomorKontrak: 'MTF-1',
      cicilanPerBulan: 8750000,
      tenorBulan: 36,
      angsuranMulai: '2026-01-10',
      angsuranTerbayar: 4,
    })

    it('leaves an identical contract completely untouched', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow())
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall).toBeUndefined()
    })

    // The proof the human partner asked for: two saves of the same lease leave exactly one row
    // in fleet_lease_contracts, not one plus a closed twin per save.
    it('leaves exactly one contract row after saving the same lease twice', async () => {
      const rows: Record<string, unknown>[] = [openRow()]
      txManager.findOne.mockImplementation(async () => rows.find((r) => r.closedAt === null) ?? null)
      txManager.update.mockImplementation(async (_e: unknown, id: unknown, patch: Record<string, unknown>) => {
        if (patch && 'closedAt' in patch) {
          const row = rows.find((r) => r.id === id)
          if (row) row.closedAt = patch.closedAt
        }
      })
      txManager.save.mockImplementation(async (_e: unknown, v: Record<string, unknown>) => {
        if (Object.prototype.hasOwnProperty.call(v, 'nomorKontrak')) {
          const row = { id: `lc-${rows.length + 1}`, ...v }
          rows.push(row)
          return row
        }
        return { id: 'v-new', ...v }
      })

      await service.update('v1', { lease: samePayload() })
      await service.update('v1', { lease: samePayload() })

      expect(rows).toHaveLength(1)
      expect(rows[0].closedAt).toBeNull()
    })

    // Each field on its own: a comparison that ignores any one of the six silently drops a real
    // refinancing on the floor and keeps reporting the old instalment.
    it.each([
      ['leasingId', { leasingId: 'ls-2' }],
      ['nomorKontrak', { nomorKontrak: 'MTF-9' }],
      ['cicilanPerBulan', { cicilanPerBulan: 9000000 }],
      ['tenorBulan', { tenorBulan: 24 }],
      ['angsuranMulai', { angsuranMulai: '2026-06-01' }],
      ['angsuranTerbayar', { angsuranTerbayar: 7 }],
    ])('closes and reopens when %s changed', async (_field, change) => {
      txManager.findOne.mockResolvedValueOnce(openRow())
      await service.update('v1', { lease: { ...samePayload(), ...change } })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall).toBeDefined()
    })

    // Clearing the operator's override is a change, and null vs 4 must not collapse through a
    // loose comparison — the derived count and a typed 4 are different answers.
    it('closes and reopens when the override is cleared', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow())
      const dto = samePayload()
      delete (dto as { angsuranTerbayar?: number | null }).angsuranTerbayar
      await service.update('v1', { lease: dto })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
    })

    // 0 is a real answer meaning nothing has been paid, so it must not be read as "blank" and
    // compared equal to a null override.
    it('treats a zero override as different from no override', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ angsuranTerbayarOverride: null }))
      await service.update('v1', { lease: { ...samePayload(), angsuranTerbayar: 0 } })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
    })

    // numeric arrives as '8750000.00' and the DTO sends 8750000. Compared as strings these differ
    // and the contract churns on every save; compared as numbers they are the same money.
    it('reads a numeric column and a JSON number as the same amount', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ cicilanPerBulan: '8750000.00' }))
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
    })

    // Some driver settings hand a date column back as 'YYYY-MM-DD' rather than a Date. Both
    // spellings of the same calendar day must compare equal.
    it('reads a date string and a Date as the same day', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ angsuranMulai: '2026-01-10' }))
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
    })

    // A unit that was never financed and still is not: nothing to close, nothing to open.
    it('writes nothing when lease is null and no contract is open', async () => {
      txManager.findOne.mockResolvedValueOnce(null)
      await service.update('v1', { lease: null })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall).toBeUndefined()
    })

    // The reviewer's live finding. pg's date parser builds the Date at LOCAL midnight, so reading
    // it back through toISOString() — which renders in UTC — reports the previous calendar day
    // anywhere east of Greenwich. Under the deployment zone Asia/Jakarta every unchanged start
    // date then reads as different and the contract churns on every save, which is the exact bug
    // Exception A exists to prevent. Constructed with the local-midnight constructor rather than
    // a 'Z' literal precisely so the suite feels what the driver hands the service.
    it('reads a local-midnight Date as its own calendar day, not the UTC one', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ angsuranMulai: new Date(2026, 0, 10) }))
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
    })

    // The same day one field over: a string-shaped stored date must be compared to the day, not
    // truncated to the month, or moving the first instalment within January goes unnoticed.
    it('closes and reopens when a string-shaped start date moves within the month', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ angsuranMulai: '2026-01-25' }))
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
    })

    // Setting an instalment on a contract that had none is a real change. Collapsing null-vs-value
    // to "same" is the worst failure available here: the save reports success and silently keeps
    // reporting no instalment.
    it('closes and reopens when an instalment is set on a contract that had none', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ cicilanPerBulan: null }))
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
    })

    // And the mirror: clearing the instalment must not read as "nothing changed" either.
    it('closes and reopens when the instalment is cleared', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow())
      await service.update('v1', { lease: { ...samePayload(), cicilanPerBulan: null } })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
    })

    // Both sides absent is the one case where "no contract" and "no lease" agree. Reported as a
    // difference it would open a contract out of a null payload on a unit that was never financed.
    it('treats no contract and no lease as the same nothing', async () => {
      txManager.findOne.mockResolvedValueOnce(null)
      await service.update('v1', { lease: null })
      expect(txManager.save).not.toHaveBeenCalled()
      expect(txManager.update).not.toHaveBeenCalled()
    })

    // Pinned on the helper rather than through update(), because update() reads a "different"
    // verdict here and then finds nothing to close and nothing to open — the two bugs cancel and
    // the mistake is invisible from outside. It stops cancelling the moment anyone adds an
    // unconditional write inside that branch, so the contract is stated where it can be seen:
    // no contract and no lease describe the same nothing.
    it('reports no contract and no lease as the same contract', () => {
      const sameContract = (
        service as unknown as {
          sameContract: (open: unknown, lease: unknown) => boolean
        }
      ).sameContract.bind(service)
      expect(sameContract(null, null)).toBe(true)
      expect(sameContract(openRow(), null)).toBe(false)
      expect(sameContract(null, samePayload())).toBe(false)
    })

    // Closing is addressed by contract id, not by vehicle id. The two are different columns and
    // passing the vehicle's would close whatever row happens to carry that id — or nothing at all,
    // leaving two open contracts on one unit.
    it('closes the open contract by its own id, not the vehicle id', async () => {
      txManager.findOne.mockResolvedValueOnce(openRow({ id: 'lc-open' }))
      await service.update('v1', { lease: { ...samePayload(), nomorKontrak: 'MTF-2' } })
      const closeCall = txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])
      expect(closeCall?.[1]).toBe('lc-open')
    })

    // A unit financed for the first time has nothing to close, but the new contract must open.
    it('opens a first contract when none was open', async () => {
      txManager.findOne.mockResolvedValueOnce(null)
      await service.update('v1', { lease: samePayload() })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeUndefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall?.[1]).toMatchObject({ nomorKontrak: 'MTF-1', closedAt: null })
    })
  })

  // Exception B. Spec §5.1 makes the required-document rule binding at the DTO and at the form,
  // but a DTO cannot read master data to learn which types carry the flag. What the backend
  // enforces is the expiry date being present: that date is what every badge and reminder is
  // computed from, so a row with a number and no date is invisible to all of them.
  describe('required documents', () => {
    const requiredRows = [
      { id: 'dt-stnk', code: 'stnk', label: 'STNK', isRequired: true },
      { id: 'dt-pajak', code: 'pajak', label: 'Pajak', isRequired: true },
    ]

    const withRequired = (docs: { docTypeId: string; nomor?: string | null; expiresAt?: string | null }[]) => [
      { docTypeId: 'dt-stnk', expiresAt: inDays(200) },
      { docTypeId: 'dt-pajak', expiresAt: inDays(100) },
      ...docs,
    ]

    beforeEach(() => {
      masterRepo.find.mockResolvedValue(requiredRows)
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow(),
      )
    })

    it('reads the flag from master data rather than hardcoding the type list', async () => {
      await service.replaceDocuments('v1', withRequired([]))
      expect(masterRepo.find).toHaveBeenCalledWith({
        where: { category: 'jenis_dokumen', isRequired: true },
      })
    })

    it('rejects a create whose payload omits a required type', async () => {
      await expect(
        service.create({
          nopol: 'B9114KYZ',
          documents: [{ docTypeId: 'dt-stnk', expiresAt: inDays(200) }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects an update whose payload omits a required type', async () => {
      await expect(
        service.update('v1', {
          documents: [{ docTypeId: 'dt-stnk', expiresAt: inDays(200) }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // The rule cannot be bypassed by going around the combined endpoint.
    it('rejects a documents-only replacement that omits a required type', async () => {
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'dt-stnk', expiresAt: inDays(200) }]),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // What is enforced is the expiry date, not the number: a required type present with a number
    // and no date still fails, because the date is what the reminders read.
    it('rejects a required type present with a number but no expiry date', async () => {
      await expect(
        service.replaceDocuments('v1', [
          { docTypeId: 'dt-stnk', expiresAt: inDays(200) },
          { docTypeId: 'dt-pajak', nomor: 'PJK-1' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a required type whose expiry date is blank', async () => {
      await expect(
        service.replaceDocuments('v1', [
          { docTypeId: 'dt-stnk', expiresAt: inDays(200) },
          { docTypeId: 'dt-pajak', expiresAt: '   ' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // Global Constraints: nomor stays optional for every type, required ones included.
    it('accepts a required type dated but unnumbered', async () => {
      await expect(
        service.replaceDocuments('v1', [
          { docTypeId: 'dt-stnk', expiresAt: inDays(200) },
          { docTypeId: 'dt-pajak', expiresAt: inDays(100) },
        ]),
      ).resolves.toBeDefined()
    })

    // A type an admin adds from the Master Data page is born is_required NULL, so the query must
    // ask for TRUE rather than for "not false" — otherwise every new type becomes mandatory the
    // moment it is created.
    it('does not demand a type whose flag is null', async () => {
      masterRepo.find.mockResolvedValue(requiredRows)
      await expect(
        service.replaceDocuments('v1', withRequired([{ docTypeId: 'dt-servis' }])),
      ).resolves.toBeDefined()
    })

    it('names the missing types in the message', async () => {
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'dt-stnk', expiresAt: inDays(200) }]),
      ).rejects.toThrow(/Pajak/)
    })

    it('rejects before opening a transaction', async () => {
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'dt-stnk', expiresAt: inDays(200) }]),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    // Omitting the key is the easiest request to send, so a create that carries no documents key
    // at all must fail exactly like one carrying an empty list — otherwise the rule is optional
    // on the only path that puts a brand-new unit in the register.
    it('rejects a create that omits the documents key entirely', async () => {
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('names every missing required type when a create omits the documents key', async () => {
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toThrow(/STNK.*Pajak/)
    })

    it('rejects such a create before opening a transaction', async () => {
      await expect(service.create({ nopol: 'B9114KYZ' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('accepts a create whose documents cover every required type', async () => {
      // create() reads the row back through findOne(), so the new id has to resolve to something.
      idQb.getRawMany.mockResolvedValue([{ id: 'v-new' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v-new' })])
      await expect(
        service.create({ nopol: 'B9114KYZ', documents: withRequired([]) }),
      ).resolves.toBeDefined()
    })

    // An absent documents key on a PATCH means "leave the papers alone", which must not be read
    // as "the operator submitted an empty set" and fail every odometer edit.
    it('leaves a patch that does not mention documents alone', async () => {
      await expect(service.update('v1', { odometer: 130000 })).resolves.toBeDefined()
    })

    // The asymmetry with create() is the point: a partial patch must not touch the document rows
    // it never mentioned, so nothing may be retired or re-inserted on the way through.
    it('writes no document rows for a patch that does not mention documents', async () => {
      await service.update('v1', { odometer: 130000 })
      expect(txManager.insert).not.toHaveBeenCalled()
      expect(
        txManager.update.mock.calls.some((c) => c[0] === FleetVehicleDocumentEntity),
      ).toBe(false)
    })

    // Nothing is flagged required, so nothing is demanded. Guards the empty-master-data case
    // rather than letting it throw on every save.
    it('demands nothing when no type carries the flag', async () => {
      masterRepo.find.mockResolvedValue([])
      await expect(service.replaceDocuments('v1', [{ docTypeId: 'dt-kir' }])).resolves.toBeDefined()
    })
  })

  describe('findOne', () => {
    it('404s when the id matches nothing', async () => {
      repo.find.mockResolvedValue([])
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
