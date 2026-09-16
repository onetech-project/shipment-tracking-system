import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'

type Repo = Record<string, jest.Mock>

const SLOT = { id: 'slot-1', category: 'jenis_berkas', code: 'stnk', label: 'STNK' }
const VEHICLE = { id: 'veh-1', nopol: 'B 9114 KYZ' }

function build(overrides: { file?: Repo; vehicle?: Repo; master?: Repo; storage?: Repo } = {}) {
  const fileRepo: Repo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (row) => ({ id: 'file-1', ...row })),
    delete: jest.fn(async () => ({ affected: 1 })),
    ...overrides.file,
  }
  const vehicleRepo: Repo = {
    findOne: jest.fn(async () => VEHICLE),
    ...overrides.vehicle,
  }
  const masterRepo: Repo = {
    findOne: jest.fn(async () => SLOT),
    ...overrides.master,
  }
  const storage: Repo = {
    createUploadUrl: jest.fn(async () => 'https://signed.example/put'),
    createDownloadUrl: jest.fn(async () => 'https://signed.example/get'),
    statObject: jest.fn(async () => ({ size: 524288, mime: 'application/pdf' })),
    deleteObject: jest.fn(async () => undefined),
    ...overrides.storage,
  }
  const service = new FleetVehicleFilesService(
    fileRepo as never,
    vehicleRepo as never,
    masterRepo as never,
    storage as never,
  )
  return { service, fileRepo, vehicleRepo, masterRepo, storage }
}

const INTENT = { filename: 'stnk.pdf', mimeType: 'application/pdf', sizeBytes: 524288 }
const CONFIRM = {
  storageKey: 'fleet/veh-1/stnk/abc.pdf',
  originalName: 'stnk.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 524288,
}

describe('createIntent', () => {
  it('returns a presigned PUT and the key the confirm must quote', async () => {
    const { service, storage } = build()
    const out = await service.createIntent('veh-1', 'slot-1', INTENT)

    expect(out.uploadUrl).toBe('https://signed.example/put')
    expect(out.storageKey).toMatch(/^fleet\/veh-1\/stnk\/[0-9a-f-]{36}\.pdf$/)
    expect(storage.createUploadUrl).toHaveBeenCalledWith(out.storageKey, 'application/pdf', 524288)
  })

  it('refuses a slot that is not a jenis_berkas row', async () => {
    const { service } = build({ master: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('veh-1', 'slot-1', INTENT)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('refuses an unknown vehicle', async () => {
    const { service } = build({ vehicle: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('veh-1', 'slot-1', INTENT)).rejects.toThrow(NotFoundException)
  })

  // A mock that always returns SLOT regardless of the query cannot tell a filtered lookup from
  // an unfiltered one — a file could otherwise be filed under a master row of the wrong kind
  // (e.g. "Mitsubishi Fuso"). Assert the filter the repo was actually asked for.
  it('asks the master repo for a jenis_berkas row, not any row with that id', async () => {
    const { service, masterRepo } = build()
    await service.createIntent('veh-1', 'slot-1', INTENT)
    expect(masterRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'slot-1', category: 'jenis_berkas' },
    })
  })
})

describe('confirm', () => {
  it('writes the row once MinIO confirms the object is there', async () => {
    const { service, fileRepo } = build()
    await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'veh-1',
        slotId: 'slot-1',
        storageKey: CONFIRM.storageKey,
        originalName: 'stnk.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '524288',
        externalUrl: null,
        uploadedBy: 'user-1',
      }),
    )
  })

  // Without this HEAD a client could confirm an upload it never performed, leaving a row that
  // points at nothing and a slot that claims to hold a file (spec §4.2 step 3).
  it('refuses a confirm for an object that is not in the bucket', async () => {
    const { service, fileRepo } = build({ storage: { statObject: jest.fn(async () => null) } })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
    expect(fileRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose size disagrees with the stored object', async () => {
    const { service, fileRepo } = build({
      storage: { statObject: jest.fn(async () => ({ size: 999, mime: 'application/pdf' })) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
    expect(fileRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose type disagrees with the stored object', async () => {
    const { service } = build({
      storage: { statObject: jest.fn(async () => ({ size: 524288, mime: 'text/html' })) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
  })

  // A key belonging to another vehicle would let one unit's confirm attach another unit's file.
  it('refuses a key that does not belong to this vehicle and slot', async () => {
    const { service } = build()
    await expect(
      service.confirm('veh-1', 'slot-1', { ...CONFIRM, storageKey: 'fleet/veh-2/stnk/x.pdf' }, 'u'),
    ).rejects.toThrow(BadRequestException)
  })

  it('replaces the row and drops the old object when a slot already holds a file', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, fileRepo, storage } = build({
      file: { findOne: jest.fn(async () => existing) },
    })
    await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }))
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/veh-1/stnk/old.pdf')
  })

  // An orphaned object costs storage; a row pointing at a deleted object costs the operator a
  // broken slot they cannot fix from the UI. The cheaper failure is the one we accept.
  it('keeps the new row when deleting the old object fails', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, fileRepo } = build({
      file: { findOne: jest.fn(async () => existing) },
      storage: { deleteObject: jest.fn(async () => { throw new Error('minio down') }) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).resolves.toBeDefined()
    expect(fileRepo.save).toHaveBeenCalled()
  })

  // TypeORM's RETURNING excludes create-date columns on an UPDATE (only asExpression, update-date
  // and version columns come back), so a slot that already held a file previously came back with
  // uploadedAt === undefined and toView() rendered the literal string "undefined". The default
  // save() mock returns exactly what the payload contains, same as a real UPDATE's merge of the
  // RETURNING row onto the entity — so this only passes if the service puts uploadedAt in the
  // payload itself.
  it('returns a valid uploadedAt when replacing a file already in the slot', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service } = build({ file: { findOne: jest.fn(async () => existing) } })
    const view = await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(view.uploadedAt).not.toBe('undefined')
    // Pins the format, not just parseability: String(someDate) also parses via `new Date(...)`,
    // so a looser check would not catch toView() losing its `instanceof Date` branch.
    expect(view.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Number.isFinite(new Date(view.uploadedAt).getTime())).toBe(true)
  })

  // Insert-path counterpart: TypeORM's RETURNING on an INSERT does include create-date columns,
  // so a real save() hands back a generated Date without the service asking for one. The save()
  // mock here reproduces that generated value the way a real INSERT would, rather than inventing
  // one the code under test does not itself produce.
  it('returns a valid uploadedAt for a slot with no existing file (insert path)', async () => {
    const { service } = build({
      file: { save: jest.fn(async (row) => ({ id: 'file-1', ...row, uploadedAt: new Date() })) },
    })
    const view = await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(view.uploadedAt).not.toBe('undefined')
    // Pins the format, not just parseability: String(someDate) also parses via `new Date(...)`,
    // so a looser check would not catch toView() losing its `instanceof Date` branch.
    expect(view.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Number.isFinite(new Date(view.uploadedAt).getTime())).toBe(true)
  })
})

describe('setExternalUrl', () => {
  it('stores the link with no storage key', async () => {
    const { service, fileRepo } = build()
    await service.setExternalUrl('veh-1', 'slot-1', { url: 'https://arsip.example/a.pdf' }, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        externalUrl: 'https://arsip.example/a.pdf',
        storageKey: null,
        sizeBytes: null,
      }),
    )
  })

  // Defence in depth: the DTO refuses this too, but the service is also reachable from tests and
  // future callers, and the check constraint cannot see a scheme.
  it('refuses a non-http scheme', async () => {
    const { service } = build()
    await expect(
      service.setExternalUrl('veh-1', 'slot-1', { url: 'javascript:alert(1)' }, 'user-1'),
    ).rejects.toThrow(BadRequestException)
  })

  it('drops the uploaded object when a slot switches to a link', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => existing) } })
    await service.setExternalUrl('veh-1', 'slot-1', { url: 'https://a.example/b.pdf' }, 'user-1')
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/veh-1/stnk/old.pdf')
  })

  // Same asymmetry as confirm(): TypeORM's UPDATE-path RETURNING drops create-date columns, so
  // this only comes back valid if the service puts uploadedAt in the save payload itself.
  it('returns a valid uploadedAt when replacing a file already in the slot', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service } = build({ file: { findOne: jest.fn(async () => existing) } })
    const view = await service.setExternalUrl(
      'veh-1',
      'slot-1',
      { url: 'https://a.example/b.pdf' },
      'user-1',
    )

    expect(view.uploadedAt).not.toBe('undefined')
    // Pins the format, not just parseability: String(someDate) also parses via `new Date(...)`,
    // so a looser check would not catch toView() losing its `instanceof Date` branch.
    expect(view.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Number.isFinite(new Date(view.uploadedAt).getTime())).toBe(true)
  })

  // Insert-path counterpart, mirroring the one in confirm(): a real INSERT's RETURNING does
  // include create-date columns, so the mock reproduces that generated value rather than the
  // service needing to set it itself.
  it('returns a valid uploadedAt for a slot with no existing file (insert path)', async () => {
    const { service } = build({
      file: { save: jest.fn(async (row) => ({ id: 'file-1', ...row, uploadedAt: new Date() })) },
    })
    const view = await service.setExternalUrl(
      'veh-1',
      'slot-1',
      { url: 'https://a.example/b.pdf' },
      'user-1',
    )

    expect(view.uploadedAt).not.toBe('undefined')
    // Pins the format, not just parseability: String(someDate) also parses via `new Date(...)`,
    // so a looser check would not catch toView() losing its `instanceof Date` branch.
    expect(view.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Number.isFinite(new Date(view.uploadedAt).getTime())).toBe(true)
  })
})

describe('downloadUrl', () => {
  it('signs a GET named after the slot and the plate', async () => {
    const file = {
      id: 'file-1',
      vehicleId: 'veh-1',
      storageKey: 'fleet/veh-1/stnk/abc.pdf',
      originalName: 'stnk.pdf',
      externalUrl: null,
      slot: SLOT,
    }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    const out = await service.downloadUrl('veh-1', 'file-1')

    expect(out.url).toBe('https://signed.example/get')
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('fleet/veh-1/stnk/abc.pdf', 'stnk.pdf')
  })

  // An external link is already a URL; re-signing it is meaningless and calling S3 would fail.
  it('hands back an external link unchanged', async () => {
    const file = {
      id: 'file-1',
      vehicleId: 'veh-1',
      storageKey: null,
      externalUrl: 'https://arsip.example/a.pdf',
      slot: SLOT,
    }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    const out = await service.downloadUrl('veh-1', 'file-1')

    expect(out.url).toBe('https://arsip.example/a.pdf')
    expect(storage.createDownloadUrl).not.toHaveBeenCalled()
  })

  it('refuses a file id belonging to another vehicle', async () => {
    const { service } = build({ file: { findOne: jest.fn(async () => null) } })
    await expect(service.downloadUrl('veh-1', 'file-1')).rejects.toThrow(NotFoundException)
  })
})

describe('remove', () => {
  it('deletes the row and the object', async () => {
    const file = { id: 'file-1', vehicleId: 'veh-1', storageKey: 'k', externalUrl: null }
    const { service, fileRepo, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    await service.remove('veh-1', 'file-1')

    expect(fileRepo.delete).toHaveBeenCalledWith('file-1')
    expect(storage.deleteObject).toHaveBeenCalledWith('k')
  })

  it('deletes a link row without calling storage', async () => {
    const file = { id: 'file-1', vehicleId: 'veh-1', storageKey: null, externalUrl: 'https://a/b' }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    await service.remove('veh-1', 'file-1')
    expect(storage.deleteObject).not.toHaveBeenCalled()
  })
})

describe('list', () => {
  it('reports the byte count as a number', async () => {
    const rows = [
      {
        id: 'file-1',
        slotId: 'slot-1',
        slot: SLOT,
        storageKey: 'k',
        originalName: 'stnk.pdf',
        mimeType: 'application/pdf',
        // bigint comes back from pg as a string; no consumer should have to decide how to parse it.
        sizeBytes: '524288',
        externalUrl: null,
        uploadedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]
    const { service } = build({ file: { find: jest.fn(async () => rows) } })
    const out = await service.list('veh-1')

    expect(out[0]).toMatchObject({
      id: 'file-1',
      slotCode: 'stnk',
      slotLabel: 'STNK',
      sizeBytes: 524288,
    })
  })
})
