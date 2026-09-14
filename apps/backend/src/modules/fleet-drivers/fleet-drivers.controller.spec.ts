/**
 * The other half of the module's one deliberate permission split: drivers share the *.fleet_vehicle
 * set on purpose — whoever registers a vehicle also assigns its driver — while master data keeps
 * its own *.fleet_master_data set. Both halves need pinning, because "drivers use the vehicle
 * permissions" is indistinguishable from a copy-paste mistake unless a test says it is intended.
 *
 * Read from the metadata @Authorize writes, which is exactly what RbacGuard reads at request time.
 */
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { FleetDriversController } from './fleet-drivers.controller'
import { FleetDriversService } from './fleet-drivers.service'

const permissionOf = (handler: keyof FleetDriversController): unknown =>
  Reflect.getMetadata(PERMISSION_KEY, FleetDriversController.prototype[handler])

describe('FleetDriversController authorization', () => {
  it('gates the list endpoint on READ_FLEET_VEHICLE', () => {
    expect(permissionOf('findAll')).toBe(Permission.READ_FLEET_VEHICLE)
  })

  it('gates create on CREATE_FLEET_VEHICLE', () => {
    expect(permissionOf('create')).toBe(Permission.CREATE_FLEET_VEHICLE)
  })

  it('gates update on UPDATE_FLEET_VEHICLE', () => {
    expect(permissionOf('update')).toBe(Permission.UPDATE_FLEET_VEHICLE)
  })

  // Confirmed to survive as READ_FLEET_VEHICLE with the rest of the fleet suite green: anyone who
  // could merely view the driver list could delete drivers.
  it('gates delete on DELETE_FLEET_VEHICLE, not the read permission', () => {
    expect(permissionOf('remove')).toBe(Permission.DELETE_FLEET_VEHICLE)
  })

  // Sweeping all five together catches a dropped @Authorize (undefined) and two handlers sharing
  // one permission, neither of which the individual assertions above can see.
  it('carries the matching verb of the vehicle set on all five handlers', () => {
    expect({
      findAll: permissionOf('findAll'),
      create: permissionOf('create'),
      update: permissionOf('update'),
      remove: permissionOf('remove'),
      restore: permissionOf('restore'),
    }).toEqual({
      findAll: Permission.READ_FLEET_VEHICLE,
      create: Permission.CREATE_FLEET_VEHICLE,
      update: Permission.UPDATE_FLEET_VEHICLE,
      remove: Permission.DELETE_FLEET_VEHICLE,
      restore: Permission.UPDATE_FLEET_VEHICLE,
    })
  })

  // Drivers deliberately do NOT get the master-data set: that set exists so a field operator can
  // register vehicles and drivers without being able to edit the lookup lists behind them.
  it('uses no master-data permission anywhere — the split is deliberate', () => {
    const masterDataPermissions = [
      Permission.READ_FLEET_MASTER_DATA,
      Permission.CREATE_FLEET_MASTER_DATA,
      Permission.UPDATE_FLEET_MASTER_DATA,
      Permission.DELETE_FLEET_MASTER_DATA,
    ]
    for (const handler of ['findAll', 'create', 'update', 'remove', 'restore'] as const) {
      expect(masterDataPermissions).not.toContain(permissionOf(handler))
    }
  })
})

// The authorization suite above reads metadata off the prototype and never builds a controller.
// The restore route needs an instance to prove it delegates, so this block makes the one the
// brief's test assumes: the constructor takes only the service, so a plain mock is enough.
describe('FleetDriversController restore', () => {
  let controller: FleetDriversController
  let service: { restore: jest.Mock }

  beforeEach(() => {
    service = { restore: jest.fn() }
    controller = new FleetDriversController(service as unknown as FleetDriversService)
  })

  it('restores an archived driver', async () => {
    await controller.restore('d1')
    expect(service.restore).toHaveBeenCalledWith('d1')
  })
})
