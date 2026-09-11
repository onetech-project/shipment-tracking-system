import { Test } from '@nestjs/testing'
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetVehiclesController } from './fleet-vehicles.controller'
import { FleetVehiclesService } from './fleet-vehicles.service'

describe('FleetVehiclesController', () => {
  let controller: FleetVehiclesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      findAll: jest.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 25 })),
      findOne: jest.fn(async () => ({ id: 'v1' })),
      create: jest.fn(async () => ({ id: 'v1' })),
      update: jest.fn(async () => ({ id: 'v1' })),
      archive: jest.fn(async () => ({ id: 'v1' })),
      restore: jest.fn(async () => ({ id: 'v1' })),
      remove: jest.fn(async () => undefined),
      replaceDocuments: jest.fn(async () => ({ id: 'v1' })),
    }
    const module = await Test.createTestingModule({
      controllers: [FleetVehiclesController],
      providers: [{ provide: FleetVehiclesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      // @Authorize also attaches RbacGuard, which pulls in PermissionsService and a database.
      // Overriding it keeps this a unit test; the permission metadata itself is asserted below.
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(FleetVehiclesController)
  })

  // The whole query object is forwarded rather than unpacked field by field, so a filter added
  // to the DTO reaches the service without a controller change.
  it('forwards the parsed query straight to the service', async () => {
    const query = { q: 'canter', severity: 'crit' as const, page: 2 }
    await controller.findAll(query)
    expect(service.findAll).toHaveBeenCalledWith(query)
  })

  it('returns the paginated envelope untouched', async () => {
    service.findAll.mockResolvedValue({ rows: [{ id: 'v1' }], total: 87, page: 2, pageSize: 25 })
    const res = await controller.findAll({})
    expect(res).toEqual({ rows: [{ id: 'v1' }], total: 87, page: 2, pageSize: 25 })
  })

  it('reads one vehicle by id', async () => {
    await controller.findOne('v1')
    expect(service.findOne).toHaveBeenCalledWith('v1')
  })

  it('creates a vehicle', async () => {
    await controller.create({ nopol: 'B 1 A' } as never)
    expect(service.create).toHaveBeenCalledWith({ nopol: 'B 1 A' })
  })

  it('updates a vehicle', async () => {
    await controller.update('v1', { merk: 'Hino' } as never)
    expect(service.update).toHaveBeenCalledWith('v1', { merk: 'Hino' })
  })

  // Archiving is a state change, not a deletion — it must never reach the destructive path.
  it('archives without hard-deleting', async () => {
    await controller.archive('v1')
    expect(service.archive).toHaveBeenCalledWith('v1')
    expect(service.remove).not.toHaveBeenCalled()
  })

  it('restores an archived vehicle', async () => {
    await controller.restore('v1')
    expect(service.restore).toHaveBeenCalledWith('v1')
  })

  // DELETE is the genuinely destructive route; the service refuses it when history exists.
  it('hard-deletes on DELETE', async () => {
    await controller.remove('v1')
    expect(service.remove).toHaveBeenCalledWith('v1')
    expect(service.archive).not.toHaveBeenCalled()
  })

  it('unwraps the documents array before handing it to the service', async () => {
    await controller.replaceDocuments('v1', { documents: [{ docTypeId: 'dt-1' }] } as never)
    expect(service.replaceDocuments).toHaveBeenCalledWith('v1', [{ docTypeId: 'dt-1' }])
  })

  // Permission metadata is the only thing standing between an authenticated user and someone
  // else's data, and it is invisible at runtime in unit tests — assert it explicitly.
  it.each([
    ['findAll', Permission.READ_FLEET_VEHICLE],
    ['findOne', Permission.READ_FLEET_VEHICLE],
    ['create', Permission.CREATE_FLEET_VEHICLE],
    ['update', Permission.UPDATE_FLEET_VEHICLE],
    ['replaceDocuments', Permission.UPDATE_FLEET_VEHICLE],
    ['restore', Permission.UPDATE_FLEET_VEHICLE],
    ['archive', Permission.DELETE_FLEET_VEHICLE],
    ['remove', Permission.DELETE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const meta = Reflect.getMetadata(
      PERMISSION_KEY,
      (FleetVehiclesController.prototype as unknown as Record<string, never>)[method],
    )
    expect(meta).toBe(permission)
  })

  // The route table is as load-bearing as the handler bodies and just as invisible to the calls
  // above: a handler wired to the wrong verb or path still passes every behavioural test while
  // the frontend 404s. Assert the metadata Nest actually mounts from.
  const handler = (method: string) =>
    (FleetVehiclesController.prototype as unknown as Record<string, never>)[method]

  it('is mounted under the fleet/vehicles prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FleetVehiclesController)).toBe('fleet/vehicles')
  })

  it.each([
    ['findAll', RequestMethod.GET, '/'],
    ['findOne', RequestMethod.GET, ':id'],
    ['create', RequestMethod.POST, '/'],
    ['update', RequestMethod.PATCH, ':id'],
    ['replaceDocuments', RequestMethod.PUT, ':id/documents'],
    ['restore', RequestMethod.POST, ':id/restore'],
    ['archive', RequestMethod.POST, ':id/archive'],
    ['remove', RequestMethod.DELETE, ':id'],
  ])('routes %s as the right verb and path', (method, verb, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler(method))).toBe(verb)
    expect(Reflect.getMetadata(PATH_METADATA, handler(method))).toBe(path)
  })

  // DELETE returns no body; 200 with an empty body makes the frontend parse '' as JSON.
  it('answers DELETE with 204 and no body', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('remove'))).toBe(204)
  })

  // Archive and restore are state changes that DO return the updated vehicle, so they must not
  // pick up a no-content code by copy-paste from remove.
  it.each(['archive', 'restore'])('leaves %s on the default 2xx so it can return the row', (m) => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler(m))).toBeUndefined()
  })
})
