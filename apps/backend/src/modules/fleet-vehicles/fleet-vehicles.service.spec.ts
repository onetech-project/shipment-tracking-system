import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { severityFor, daysUntil, todayISO } from './fleet-severity'

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
  nopol: 'B 9114 KYZ',
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
  let masterRepo: { findOne: jest.Mock }
  let dataSource: { transaction: jest.Mock }
  let idQb: Record<string, jest.Mock>
  let docQb: Record<string, jest.Mock>
  let txManager: { update: jest.Mock; insert: jest.Mock; save: jest.Mock; create: jest.Mock }

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
    masterRepo = { findOne: jest.fn(async () => ({ id: 'ja-1', category: 'jenis_armada' })) }
    txManager = {
      update: jest.fn(),
      insert: jest.fn(),
      save: jest.fn(async (_e, v) => v),
      create: jest.fn((_e, v) => v),
    }
    dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(txManager)) }

    const module = await Test.createTestingModule({
      providers: [
        FleetVehiclesService,
        { provide: getRepositoryToken(FleetVehicleEntity), useValue: repo },
        { provide: getRepositoryToken(FleetVehicleDocumentEntity), useValue: docRepo },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: masterRepo },
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
      expect(clause?.[1]).toEqual({ q: '%canter%' })
      const sql = String(clause?.[0])
      expect(sql).toContain('v.nopol')
      expect(sql).toContain('v.merk')
      expect(sql).toContain('v.tipe')
      expect(sql).toContain('v.noRangka')
      expect(sql).toContain('v.noMesin')
      expect(sql).toContain('dr.nama')
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

    // Vehicles with no view row must sort last, not first: COALESCE to 3 puts 'none' behind
    // 'ok'. Without it NULLs would lead the list and bury the expired units the sort exists for.
    it('sorts by severity worst-first with unknown units last', async () => {
      await service.findAll({ sort: 'severity' })
      const [expr, dir] = idQb.orderBy.mock.calls[0]
      expect(String(expr)).toContain('COALESCE(vs.severity_rank, 3)')
      expect(dir).toBe('ASC')
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
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B 9114 KYZ' }))
    })

    it('rejects a blank plate', async () => {
      await expect(service.create({ nopol: '   ' })).rejects.toBeInstanceOf(BadRequestException)
    })

    // The plate is what an operator recognises a unit by; two live rows sharing one make the
    // register ambiguous at exactly the moment it is consulted.
    it('refuses a plate an active vehicle already holds', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ id: 'other' }))
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('checks the clash against live units only', async () => {
      await service.create({ nopol: 'B 9114 KYZ' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect((clashCall?.[0] as { where: Record<string, unknown> }).where).toMatchObject({
        nopol: 'B 9114 KYZ',
        isActive: true,
      })
    })

    // The FK only proves the row exists. Without the category check a vehicle saves happily with
    // pool_id pointing at a leasing company, and the pool filter then never finds it.
    it('rejects a master id from the wrong category', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ nopol: 'B 1 A', poolId: 'not-a-pool' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('checks each master field against its own category', async () => {
      await service.create({
        nopol: 'B 1 A',
        jenisArmadaId: 'ja-1',
        kepemilikanId: 'kp-1',
        poolId: 'pl-1',
        statusId: 'st-1',
      })
      const categories = masterRepo.findOne.mock.calls.map(
        (c) => (c[0] as { where: { category: string } }).where.category,
      )
      expect(categories).toEqual([
        'jenis_armada',
        'kepemilikan',
        'pool',
        'status_kendaraan',
      ])
    })

    it('collapses blank optional text to null', async () => {
      await service.create({ nopol: 'B 1 A', merk: '   ', catatan: '' })
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ merk: null, catatan: null }),
      )
    })

    // The check-then-act above still loses a race. Surfacing the constraint violation as the same
    // 409 keeps the two paths indistinguishable to the client rather than leaking a 500.
    it('translates a concurrent unique violation into a conflict', async () => {
      repo.save.mockRejectedValue({ code: '23505', constraint: 'uq_fleet_vehicles_nopol_active' })
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('rethrows an unrelated database error untouched', async () => {
      repo.save.mockRejectedValue({ code: '23503', constraint: 'fk_fleet_vehicles_pool' })
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.not.toBeInstanceOf(
        ConflictException,
      )
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
      expect(repo.update).toHaveBeenCalledWith('v1', { merk: 'Hino' })
    })

    it('clears a column when the payload sends null', async () => {
      await service.update('v1', { odometer: null })
      expect(repo.update).toHaveBeenCalledWith('v1', { odometer: null })
    })

    it('skips the write entirely for an empty payload', async () => {
      await service.update('v1', {})
      expect(repo.update).not.toHaveBeenCalled()
    })

    // Re-checking on every update would reject a vehicle for colliding with itself. Only a
    // changed plate needs the probe.
    it('does not re-check the plate when it is unchanged', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ nopol: 'B 9114 KYZ' }))
      await service.update('v1', { nopol: 'b 9114 kyz' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect(clashCall).toBeUndefined()
    })

    it('checks a changed plate against other live units', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ nopol: 'B 9114 KYZ' }))
        .mockResolvedValueOnce(vehicleRow({ id: 'other', nopol: 'B 2 XX' }))
      await expect(service.update('v1', { nopol: 'B 2 XX' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('normalises a changed plate before storing it', async () => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow({ nopol: 'B 9114 KYZ' }),
      )
      await service.update('v1', { nopol: 'b   2   xx' })
      expect(repo.update).toHaveBeenCalledWith('v1', { nopol: 'B 2 XX' })
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

  describe('findOne', () => {
    it('404s when the id matches nothing', async () => {
      repo.find.mockResolvedValue([])
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
