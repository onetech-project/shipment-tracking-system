import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetAlertsController } from './fleet-alerts.controller'
import { FleetAlertsService } from './fleet-alerts.service'

describe('FleetAlertsController', () => {
  let controller: FleetAlertsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = { list: jest.fn(async () => []) }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetAlertsController],
      providers: [{ provide: FleetAlertsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetAlertsController)
  })

  it('passes the limit through', async () => {
    await controller.list({ limit: 10 })
    expect(service.list).toHaveBeenCalledWith(10)
  })

  // Undefined rather than a number the controller picked: the default belongs in one place, and
  // it is the service.
  it('leaves the default to the service when no limit is given', async () => {
    await controller.list({})
    expect(service.list).toHaveBeenCalledWith(undefined)
  })

  it('guards the route with read.fleet_vehicle', () => {
    const handler = (FleetAlertsController.prototype as unknown as Record<string, never>).list
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(Permission.READ_FLEET_VEHICLE)
  })
})
