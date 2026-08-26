import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { VendorGroupsController } from './vendor-groups.controller'
import { VendorGroupsService } from './vendor-groups.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('VendorGroupsController', () => {
  let controller: VendorGroupsController
  let service: {
    findAll: jest.Mock
    getAvailableVendors: jest.Mock
    create: jest.Mock
    update: jest.Mock
    remove: jest.Mock
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      getAvailableVendors: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'vg1' }),
      update: jest.fn().mockResolvedValue({ id: 'vg1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    const module = await Test.createTestingModule({
      controllers: [VendorGroupsController],
      providers: [{ provide: VendorGroupsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(VendorGroupsController)
  })

  it('lists groups', async () => {
    await controller.findAll()
    expect(service.findAll).toHaveBeenCalled()
  })

  it('lists available vendors', async () => {
    await controller.getAvailableVendors()
    expect(service.getAvailableVendors).toHaveBeenCalled()
  })

  it('passes the create payload straight through', async () => {
    const dto = { name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }
    await controller.create(dto)
    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('passes the id and payload to update', async () => {
    await controller.update('vg1', { name: 'Baru' })
    expect(service.update).toHaveBeenCalledWith('vg1', { name: 'Baru' })
  })

  it('passes the id to remove', async () => {
    await controller.remove('vg1')
    expect(service.remove).toHaveBeenCalledWith('vg1')
  })

  // The tests above call controller methods directly, which bypasses guards entirely — they only
  // prove delegation, not that each route is actually gated. Deleting an `@Authorize` decorator
  // (e.g. on `remove`) would fall back to JwtAuthGuard alone and let any authenticated user hit the
  // route, while every test above would still pass. This pins the metadata RbacGuard and
  // buildAuthMap both read, so removing a decorator fails here instead of shipping silently.
  it.each([
    ['findAll', Permission.READ_VENDOR_GROUP],
    ['getAvailableVendors', Permission.READ_VENDOR_GROUP],
    ['create', Permission.CREATE_VENDOR_GROUP],
    ['update', Permission.UPDATE_VENDOR_GROUP],
    ['remove', Permission.DELETE_VENDOR_GROUP],
  ])('gates %s on its own permission', (method, permission) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, VendorGroupsController.prototype[method])).toBe(
      permission,
    )
  })
})
