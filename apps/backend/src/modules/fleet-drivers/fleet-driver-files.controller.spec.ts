import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetDriverFilesController } from './fleet-driver-files.controller'
import { FleetDriverFilesService } from './fleet-driver-files.service'

describe('FleetDriverFilesController', () => {
  let controller: FleetDriverFilesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      createIntent: jest.fn(async () => ({ uploadUrl: 'u', storageKey: 'k' })),
      confirm: jest.fn(async () => undefined),
      downloadUrl: jest.fn(async () => ({ url: 'u' })),
      remove: jest.fn(async () => undefined),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetDriverFilesController],
      providers: [{ provide: FleetDriverFilesService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetDriverFilesController)
  })

  it('passes the intent through', async () => {
    await controller.createIntent('d1', { filename: 'a.png' } as never)
    expect(service.createIntent).toHaveBeenCalledWith('d1', { filename: 'a.png' })
  })

  it('passes the confirm through', async () => {
    await controller.confirm('d1', { storageKey: 'k' } as never)
    expect(service.confirm).toHaveBeenCalledWith('d1', { storageKey: 'k' })
  })

  it('signs a download', async () => {
    await controller.downloadUrl('d1')
    expect(service.downloadUrl).toHaveBeenCalledWith('d1')
  })

  it('removes the scan', async () => {
    await controller.remove('d1')
    expect(service.remove).toHaveBeenCalledWith('d1')
  })

  // The brief's original assertion (`.toEqual([permission])`) is wrong: @Authorize is
  // SetMetadata(PERMISSION_KEY, permission), which stores a scalar, not an array. Corrected per
  // the working shape in fleet-vehicles.controller.spec.ts lines 104-109.
  it.each([
    ['createIntent', Permission.UPDATE_FLEET_VEHICLE],
    ['confirm', Permission.UPDATE_FLEET_VEHICLE],
    ['downloadUrl', Permission.READ_FLEET_VEHICLE],
    ['remove', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const meta = Reflect.getMetadata(
      PERMISSION_KEY,
      (FleetDriverFilesController.prototype as unknown as Record<string, never>)[method],
    )
    expect(meta).toBe(permission)
  })
})
