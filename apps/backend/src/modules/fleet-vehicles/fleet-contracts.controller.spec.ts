import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetContractsController } from './fleet-contracts.controller'
import { FleetContractsService } from './fleet-contracts.service'

describe('FleetContractsController', () => {
  let controller: FleetContractsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = { list: jest.fn(async () => []), close: jest.fn(async () => ({ id: 'c1' })) }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetContractsController],
      providers: [{ provide: FleetContractsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetContractsController)
  })

  it('lists a vehicle contracts', async () => {
    await controller.list('v1')
    expect(service.list).toHaveBeenCalledWith('v1')
  })

  it('closes a contract', async () => {
    await controller.close('c1')
    expect(service.close).toHaveBeenCalledWith('c1')
  })

  it.each([
    ['list', Permission.READ_FLEET_VEHICLE],
    ['close', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetContractsController.prototype as unknown as Record<string, never>)[method]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(permission)
  })
})
