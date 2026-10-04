import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { RouteSimulationController } from './route-simulation.controller'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('RouteSimulationController', () => {
  let controller: RouteSimulationController
  const source = { getSource: jest.fn().mockResolvedValue({}) }
  const scenarios = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(undefined),
  }
  const user = { id: 'u1', username: 'faris', organizationId: null, isSuperAdmin: false, roles: [], permissions: [] }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      controllers: [RouteSimulationController],
      providers: [
        { provide: RouteSimulationSourceService, useValue: source },
        { provide: RouteSimulationScenariosService, useValue: scenarios },
      ],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(RouteSimulationController)
  })

  it('passes the basis to the source service', async () => {
    await controller.getSource('atd_origin')
    expect(source.getSource).toHaveBeenCalledWith('atd_origin')
  })

  it('passes the acting user id to create and update', async () => {
    await controller.create({ name: 'A', payload: {} }, user)
    expect(scenarios.create).toHaveBeenCalledWith({ name: 'A', payload: {} }, 'u1')
    await controller.update('s1', { revision: 1 }, user)
    expect(scenarios.update).toHaveBeenCalledWith('s1', { revision: 1 }, 'u1')
  })

  it('delegates list, get and remove', async () => {
    await controller.findAll()
    await controller.findOne('s1')
    await controller.remove('s1')
    expect(scenarios.findAll).toHaveBeenCalled()
    expect(scenarios.findOne).toHaveBeenCalledWith('s1')
    expect(scenarios.remove).toHaveBeenCalledWith('s1')
  })

  it.each([
    ['getSource', Permission.READ_ROUTE_SIMULATION],
    ['findAll', Permission.READ_ROUTE_SIMULATION],
    ['findOne', Permission.READ_ROUTE_SIMULATION],
    ['create', Permission.CREATE_ROUTE_SIMULATION],
    ['update', Permission.UPDATE_ROUTE_SIMULATION],
    ['remove', Permission.DELETE_ROUTE_SIMULATION],
  ])('gates %s on its own permission', (method, permission) => {
    const proto = RouteSimulationController.prototype as unknown as Record<string, object>
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toBe(permission)
  })
})
