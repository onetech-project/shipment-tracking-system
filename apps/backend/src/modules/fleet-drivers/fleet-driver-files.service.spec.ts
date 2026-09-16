import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FleetDriverFilesService } from './fleet-driver-files.service'

type Repo = Record<string, jest.Mock>

const DRIVER = {
  id: 'drv-1',
  nama: 'Ahmad Fauzi',
  simStorageKey: null,
  simOriginalName: null,
  simMimeType: null,
  simSizeBytes: null,
}

function build(overrides: { driver?: Repo; storage?: Repo } = {}) {
  const driverRepo: Repo = {
    findOne: jest.fn(async () => ({ ...DRIVER })),
    update: jest.fn(async () => ({ affected: 1 })),
    ...overrides.driver,
  }
  const storage: Repo = {
    createUploadUrl: jest.fn(async () => 'https://signed.example/put'),
    createDownloadUrl: jest.fn(async () => 'https://signed.example/get'),
    statObject: jest.fn(async () => ({ size: 1024, mime: 'image/png' })),
    deleteObject: jest.fn(async () => undefined),
    ...overrides.storage,
  }
  return {
    service: new FleetDriverFilesService(driverRepo as never, storage as never),
    driverRepo,
    storage,
  }
}

const INTENT = { filename: 'sim.png', mimeType: 'image/png', sizeBytes: 1024 }
const CONFIRM = {
  storageKey: 'fleet/drivers/drv-1/sim/abc.png',
  originalName: 'sim.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
}

describe('FleetDriverFilesService', () => {
  it('signs a PUT under the driver prefix', async () => {
    const { service, storage } = build()
    const out = await service.createIntent('drv-1', INTENT)

    expect(out.storageKey).toMatch(/^fleet\/drivers\/drv-1\/sim\/[0-9a-f-]{36}\.png$/)
    expect(storage.createUploadUrl).toHaveBeenCalledWith(out.storageKey, 'image/png', 1024)
  })

  it('refuses an unknown driver', async () => {
    const { service } = build({ driver: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('drv-1', INTENT)).rejects.toThrow(NotFoundException)
  })

  it('writes the columns once MinIO confirms the object', async () => {
    const { service, driverRepo } = build()
    await service.confirm('drv-1', CONFIRM)

    expect(driverRepo.update).toHaveBeenCalledWith('drv-1', {
      simStorageKey: CONFIRM.storageKey,
      simOriginalName: 'sim.png',
      simMimeType: 'image/png',
      simSizeBytes: '1024',
    })
  })

  // Same reasoning as the vehicle confirm: the client's claim that it uploaded is not evidence.
  it('refuses a confirm for an object that is not in the bucket', async () => {
    const { service, driverRepo } = build({ storage: { statObject: jest.fn(async () => null) } })
    await expect(service.confirm('drv-1', CONFIRM)).rejects.toThrow(BadRequestException)
    expect(driverRepo.update).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose size disagrees with the object', async () => {
    const { service } = build({
      storage: { statObject: jest.fn(async () => ({ size: 5, mime: 'image/png' })) },
    })
    await expect(service.confirm('drv-1', CONFIRM)).rejects.toThrow(BadRequestException)
  })

  it('refuses a key belonging to another driver', async () => {
    const { service } = build()
    await expect(
      service.confirm('drv-1', { ...CONFIRM, storageKey: 'fleet/drivers/drv-2/sim/x.png' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('drops the superseded scan when a driver re-uploads', async () => {
    const { service, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({ ...DRIVER, simStorageKey: 'fleet/drivers/drv-1/sim/old.png' })),
        update: jest.fn(async () => ({ affected: 1 })),
      },
    })
    await service.confirm('drv-1', CONFIRM)
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/drivers/drv-1/sim/old.png')
  })

  // Added beyond the brief: nothing above ever makes deleteObject reject, so a rethrow instead of
  // the intended log-and-swallow would pass every other test. An orphaned object is cheaper than a
  // licence slot the operator cannot repair, so a failed delete of the superseded scan must not
  // fail the confirm that already wrote the new columns.
  it('does not fail the confirm when deleting the superseded object fails', async () => {
    const { service, driverRepo } = build({
      driver: {
        findOne: jest.fn(async () => ({ ...DRIVER, simStorageKey: 'fleet/drivers/drv-1/sim/old.png' })),
        update: jest.fn(async () => ({ affected: 1 })),
      },
      storage: { deleteObject: jest.fn(async () => Promise.reject(new Error('bucket unreachable'))) },
    })
    await expect(service.confirm('drv-1', CONFIRM)).resolves.toBeUndefined()
    expect(driverRepo.update).toHaveBeenCalled()
  })

  it('signs a download named after the driver', async () => {
    const { service, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({
          ...DRIVER,
          simStorageKey: 'fleet/drivers/drv-1/sim/a.png',
          simOriginalName: 'sim.png',
        })),
      },
    })
    const out = await service.downloadUrl('drv-1')

    expect(out.url).toBe('https://signed.example/get')
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('fleet/drivers/drv-1/sim/a.png', 'sim.png')
  })

  it('refuses a download when the driver has no scan', async () => {
    const { service } = build()
    await expect(service.downloadUrl('drv-1')).rejects.toThrow(NotFoundException)
  })

  it('clears the columns and the object on remove', async () => {
    const { service, driverRepo, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({ ...DRIVER, simStorageKey: 'k' })),
        update: jest.fn(async () => ({ affected: 1 })),
      },
    })
    await service.remove('drv-1')

    expect(driverRepo.update).toHaveBeenCalledWith('drv-1', {
      simStorageKey: null,
      simOriginalName: null,
      simMimeType: null,
      simSizeBytes: null,
    })
    expect(storage.deleteObject).toHaveBeenCalledWith('k')
  })
})
