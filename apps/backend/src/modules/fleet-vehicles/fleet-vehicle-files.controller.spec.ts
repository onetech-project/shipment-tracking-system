import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetVehicleFilesController } from './fleet-vehicle-files.controller'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'

describe('FleetVehicleFilesController', () => {
  let controller: FleetVehicleFilesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      list: jest.fn(async () => []),
      createIntent: jest.fn(async () => ({ uploadUrl: 'u', storageKey: 'k' })),
      confirm: jest.fn(async () => ({ id: 'file-1' })),
      setExternalUrl: jest.fn(async () => ({ id: 'file-1' })),
      downloadUrl: jest.fn(async () => ({ url: 'u' })),
      remove: jest.fn(async () => undefined),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetVehicleFilesController],
      providers: [{ provide: FleetVehicleFilesService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetVehicleFilesController)
  })

  it('passes the intent through', async () => {
    await controller.createIntent('v1', 's1', {
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    })
    expect(service.createIntent).toHaveBeenCalledWith('v1', 's1', {
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    })
  })

  // The uploader is taken from the token, never from the body: a client that could name the
  // uploader could attribute its upload to someone else.
  it('stamps the confirm with the caller from the token', async () => {
    await controller.confirm('v1', 's1', { storageKey: 'k' } as never, { id: 'user-9' } as never)
    expect(service.confirm).toHaveBeenCalledWith('v1', 's1', { storageKey: 'k' }, 'user-9')
  })

  it('stamps an external link with the caller too', async () => {
    await controller.setExternalUrl(
      'v1',
      's1',
      { url: 'https://a/b' } as never,
      { id: 'user-9' } as never,
    )
    expect(service.setExternalUrl).toHaveBeenCalledWith('v1', 's1', { url: 'https://a/b' }, 'user-9')
  })

  it('signs a download', async () => {
    await controller.downloadUrl('v1', 'f1', {})
    expect(service.downloadUrl).toHaveBeenCalledWith('v1', 'f1', undefined)
  })

  it('passes a requested inline disposition through to the service', async () => {
    await controller.downloadUrl('v1', 'f1', { disposition: 'inline' })
    expect(service.downloadUrl).toHaveBeenCalledWith('v1', 'f1', 'inline')
  })

  it('removes a file', async () => {
    await controller.remove('v1', 'f1')
    expect(service.remove).toHaveBeenCalledWith('v1', 'f1')
  })

  // Permission metadata is invisible at runtime in unit tests and is the only thing between an
  // authenticated user and someone else's files — assert it explicitly.
  //
  // The brief's own draft asserted `toEqual([permission])`, but @Authorize's SetMetadata call
  // stores the bare Permission value, not an array (see fleet-vehicles.controller.spec.ts, the
  // sibling spec this one is modeled on, which asserts `toBe(permission)`). Fixed to match what
  // RbacGuard actually reads via `reflector.getAllAndOverride<Permission>(...)`.
  it.each([
    ['list', Permission.READ_FLEET_VEHICLE],
    ['createIntent', Permission.UPDATE_FLEET_VEHICLE],
    ['confirm', Permission.UPDATE_FLEET_VEHICLE],
    ['setExternalUrl', Permission.UPDATE_FLEET_VEHICLE],
    ['downloadUrl', Permission.READ_FLEET_VEHICLE],
    ['remove', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetVehicleFilesController.prototype as unknown as Record<string, unknown>)[
      method
    ]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toBe(permission)
  })
})
