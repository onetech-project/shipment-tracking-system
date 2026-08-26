import { Test } from '@nestjs/testing'
import { RouteGroupsController } from './route-groups.controller'
import { RouteGroupsService } from './route-groups.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('RouteGroupsController', () => {
  let controller: RouteGroupsController
  let service: {
    findAll: jest.Mock
    getAvailableRoutes: jest.Mock
    create: jest.Mock
    update: jest.Mock
    remove: jest.Mock
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      getAvailableRoutes: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'g1' }),
      update: jest.fn().mockResolvedValue({ id: 'g1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    const module = await Test.createTestingModule({
      controllers: [RouteGroupsController],
      providers: [{ provide: RouteGroupsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(RouteGroupsController)
  })

  it('lists groups', async () => {
    await controller.findAll()
    expect(service.findAll).toHaveBeenCalled()
  })

  it('lists available routes', async () => {
    await controller.getAvailableRoutes()
    expect(service.getAvailableRoutes).toHaveBeenCalled()
  })

  it('passes the create payload straight through', async () => {
    const dto = { name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Balikpapan' }] }
    await controller.create(dto)
    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('passes the id and payload to update', async () => {
    await controller.update('g1', { name: 'Baru' })
    expect(service.update).toHaveBeenCalledWith('g1', { name: 'Baru' })
  })

  it('passes the id to remove', async () => {
    await controller.remove('g1')
    expect(service.remove).toHaveBeenCalledWith('g1')
  })
})
