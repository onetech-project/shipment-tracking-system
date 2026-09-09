/**
 * The permission on each handler is the whole of this module's authorization, and nothing else in
 * the suite reads it: the service is permission-blind and the guard is generic, so swapping
 * DELETE_FLEET_MASTER_DATA for READ_FLEET_MASTER_DATA leaves every other backend fleet test green
 * while handing read-only users the power to erase the rows every dropdown in the module feeds on.
 *
 * The design spec draws exactly one deliberate permission split: master data carries its own
 * *.fleet_master_data set so a field operator can register vehicles without editing the leasing or
 * pool lists, while drivers, documents, berkas and lease contracts share *.fleet_vehicle. This
 * file pins the master-data half; fleet-drivers.controller.spec.ts pins the other.
 *
 * Asserted against the metadata @Authorize writes rather than through the guard: the value stored
 * under PERMISSION_KEY is exactly what RbacGuard reads at request time, so pinning it here pins
 * enforcement without standing up a request pipeline.
 */
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { FleetMasterDataController } from './fleet-master-data.controller'

const permissionOf = (handler: keyof FleetMasterDataController): unknown =>
  Reflect.getMetadata(PERMISSION_KEY, FleetMasterDataController.prototype[handler])

describe('FleetMasterDataController authorization', () => {
  // Each is asserted against the enum member, not the 'read.fleet_master_data' string, so a typo
  // in the enum's value cannot be papered over by the same typo here.
  it('gates the list endpoint on READ_FLEET_MASTER_DATA', () => {
    expect(permissionOf('findAll')).toBe(Permission.READ_FLEET_MASTER_DATA)
  })

  it('gates create on CREATE_FLEET_MASTER_DATA', () => {
    expect(permissionOf('create')).toBe(Permission.CREATE_FLEET_MASTER_DATA)
  })

  it('gates update on UPDATE_FLEET_MASTER_DATA', () => {
    expect(permissionOf('update')).toBe(Permission.UPDATE_FLEET_MASTER_DATA)
  })

  // The one that nearly shipped as READ_FLEET_VEHICLE: delete is irreversible and this is the
  // enforcing side, so a widened permission here is not a cosmetic defect.
  it('gates delete on DELETE_FLEET_MASTER_DATA', () => {
    expect(permissionOf('remove')).toBe(Permission.DELETE_FLEET_MASTER_DATA)
  })

  // A handler that lost its @Authorize entirely stores undefined, and every assertion above would
  // still be about some *other* handler. Sweeping all four catches a decorator dropped in a merge,
  // and catches two handlers accidentally sharing one permission.
  it('carries a distinct master-data permission on all four handlers', () => {
    expect({
      findAll: permissionOf('findAll'),
      create: permissionOf('create'),
      update: permissionOf('update'),
      remove: permissionOf('remove'),
    }).toEqual({
      findAll: Permission.READ_FLEET_MASTER_DATA,
      create: Permission.CREATE_FLEET_MASTER_DATA,
      update: Permission.UPDATE_FLEET_MASTER_DATA,
      remove: Permission.DELETE_FLEET_MASTER_DATA,
    })
  })

  // The split is the point: master data must not fall back to the vehicle set. Asserting the
  // absence of every *.fleet_vehicle value catches a copy-paste from the drivers controller that
  // happened to keep the right verb.
  it('uses no vehicle permission anywhere — the split is deliberate', () => {
    const vehiclePermissions = [
      Permission.READ_FLEET_VEHICLE,
      Permission.CREATE_FLEET_VEHICLE,
      Permission.UPDATE_FLEET_VEHICLE,
      Permission.DELETE_FLEET_VEHICLE,
    ]
    for (const handler of ['findAll', 'create', 'update', 'remove'] as const) {
      expect(vehiclePermissions).not.toContain(permissionOf(handler))
    }
  })
})
