import { Test } from '@nestjs/testing'
import { DataSource, EntityManager } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

describe('RouteGroupsService', () => {
  let service: RouteGroupsService
  let dataSource: { query: jest.Mock; transaction: jest.Mock }
  let manager: { getRepository: jest.Mock }
  let groupRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let routeRepo: { delete: jest.Mock; insert: jest.Mock }

  beforeEach(async () => {
    groupRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    routeRepo = { delete: jest.fn(), insert: jest.fn() }
    // The service runs group + route writes inside dataSource.transaction and pulls its repos off
    // the transactional manager, so the mock manager routes each entity to the same repo mocks the
    // tests assert against.
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === RouteGroupEntity ? groupRepo : routeRepo,
      ),
    }
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    }
    const module = await Test.createTestingModule({
      providers: [
        RouteGroupsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(RouteGroupEntity), useValue: groupRepo },
        { provide: getRepositoryToken(RouteGroupRouteEntity), useValue: routeRepo },
      ],
    }).compile()
    service = module.get(RouteGroupsService)
  })

  describe('getAvailableRoutes', () => {
    it('returns master station pairs with display labels and a data flag', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
        { origin: 'Surabaya', dest: 'Pontianak', has_data: true },
        { origin: 'Medan', dest: 'Batam', has_data: false },
      ])

      const result = await service.getAvailableRoutes()

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('air_shipments_data'),
      )
      expect(result).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', hasData: true },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak', hasData: true },
        // An origin with no entry in ORIGIN_LABELS keeps its raw value rather than going blank.
        { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', hasData: false },
      ])
    })

    it('returns an empty list when the master has no Air rows', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.getAvailableRoutes()).resolves.toEqual([])
    })
  })

  describe('findAll', () => {
    it('returns each group with its routes, labelled', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'g1', name: 'Kalimantan', description: null, origin: 'Jabo', dest: 'Balikpapan' },
        { id: 'g1', name: 'Kalimantan', description: null, origin: 'Surabaya', dest: 'Pontianak' },
        { id: 'g2', name: 'Sumatera', description: 'pulau', origin: 'Jabo', dest: 'Batam' },
      ])

      const result = await service.findAll()

      expect(result).toEqual([
        {
          id: 'g1',
          name: 'Kalimantan',
          description: null,
          routes: [
            { origin: 'Jabo', originLabel: 'CGK', dest: 'Balikpapan' },
            { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
          ],
        },
        {
          id: 'g2',
          name: 'Sumatera',
          description: 'pulau',
          routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Batam' }],
        },
      ])
    })

    it('returns an empty array when there are no groups', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.findAll()).resolves.toEqual([])
    })

    it('yields routes: [] for a group whose LEFT JOIN produced a single all-null route row', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'g1', name: 'Empty', description: null, origin: null, dest: null },
      ])

      const result = await service.findAll()

      expect(result).toEqual([{ id: 'g1', name: 'Empty', description: null, routes: [] }])
    })
  })

  describe('create', () => {
    // A route the master does not know about can never produce numbers, so it is rejected at the
    // door rather than silently stored.
    it('rejects a route that is not in the master list', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
      ])

      await expect(
        service.create({ name: 'Bad', routes: [{ origin: 'Jabo', dest: 'Nowhere' }] }),
      ).rejects.toThrow('Unknown route: Jabo → Nowhere')
    })

    it('rejects a duplicate name with a conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce({ id: 'existing', name: 'Kalimantan' })

      await expect(
        service.create({ name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Aceh' }] }),
      ).rejects.toThrow('A route group named "Kalimantan" already exists')
    })

    it('saves the group, de-dupes and inserts the routes, and returns the created group', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin: 'Jabo', dest: 'Aceh', has_data: true }]) // assertRoutesExist
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Kalimantan', description: 'pulau', origin: 'Jabo', dest: 'Aceh' },
        ]) // findOneOrThrow -> findAll
      groupRepo.findOne.mockResolvedValueOnce(null) // assertNameFree: no clash

      const result = await service.create({
        name: 'Kalimantan',
        description: 'pulau',
        routes: [
          { origin: 'Jabo', dest: 'Aceh' },
          { origin: 'Jabo', dest: 'Aceh' }, // duplicate pair: must not reach the insert twice
        ],
      })

      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kalimantan', description: 'pulau' }),
      )
      expect(routeRepo.delete).toHaveBeenCalledWith({ routeGroupId: 'new-id' })
      expect(routeRepo.insert).toHaveBeenCalledWith([
        { routeGroupId: 'new-id', originStation: 'Jabo', destStation: 'Aceh' },
      ])
      expect(result).toEqual({
        id: 'new-id',
        name: 'Kalimantan',
        description: 'pulau',
        routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
      })
    })

    it('normalizes a whitespace-only description to null', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin: 'Jabo', dest: 'Aceh', has_data: true }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Kalimantan', description: null, origin: 'Jabo', dest: 'Aceh' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      await service.create({
        name: 'Kalimantan',
        description: '   ',
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })

      expect(groupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
    })

    it('maps a unique-name race (23505 on uq_route_groups_name) to the same ConflictException as the pre-check', async () => {
      dataSource.query.mockResolvedValueOnce([{ origin: 'Jabo', dest: 'Aceh', has_data: true }])
      groupRepo.findOne.mockResolvedValueOnce(null) // pre-check sees no clash
      groupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_route_groups_name',
        }),
      )

      await expect(
        service.create({ name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Aceh' }] }),
      ).rejects.toThrow('A route group named "Kalimantan" already exists')
    })

    it('does not remap a 23505 from an unrelated constraint into a name conflict', async () => {
      dataSource.query.mockResolvedValueOnce([{ origin: 'Jabo', dest: 'Aceh', has_data: true }])
      groupRepo.findOne.mockResolvedValueOnce(null)
      groupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('some other violation'), {
          code: '23505',
          constraint: 'pk_route_group_routes',
        }),
      )

      await expect(
        service.create({ name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Aceh' }] }),
      ).rejects.toThrow('some other violation')
    })
  })

  describe('update', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Route group not found',
      )
    })

    it('replaces the routes without touching name/description when only routes are given', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'g1', name: 'Kalimantan', description: 'pulau' })
      dataSource.query
        .mockResolvedValueOnce([{ origin: 'Jabo', dest: 'Aceh', has_data: true }]) // assertRoutesExist
        .mockResolvedValueOnce([
          { id: 'g1', name: 'Kalimantan', description: 'pulau', origin: 'Jabo', dest: 'Aceh' },
        ]) // findOneOrThrow

      const result = await service.update('g1', { routes: [{ origin: 'Jabo', dest: 'Aceh' }] })

      expect(groupRepo.update).not.toHaveBeenCalled()
      expect(routeRepo.delete).toHaveBeenCalledWith({ routeGroupId: 'g1' })
      expect(routeRepo.insert).toHaveBeenCalledWith([
        { routeGroupId: 'g1', originStation: 'Jabo', destStation: 'Aceh' },
      ])
      expect(result.name).toBe('Kalimantan')
      expect(result.description).toBe('pulau')
    })

    it('normalizes description to null when explicitly cleared', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'g1', name: 'Kalimantan', description: 'pulau' })
      dataSource.query.mockResolvedValueOnce([
        { id: 'g1', name: 'Kalimantan', description: null, origin: null, dest: null },
      ])

      await service.update('g1', { description: null })

      expect(groupRepo.update).toHaveBeenCalledWith('g1', { description: null })
    })

    it('maps a unique-name race (23505 on uq_route_groups_name) to the same ConflictException as the pre-check', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce({ id: 'g1', name: 'Old' }) // existing lookup
        .mockResolvedValueOnce(null) // assertNameFree pre-check sees no clash
      groupRepo.update.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_route_groups_name',
        }),
      )

      await expect(service.update('g1', { name: 'New' })).rejects.toThrow(
        'A route group named "New" already exists',
      )
    })
  })

  describe('remove', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.remove('missing')).rejects.toThrow('Route group not found')
    })

    it('deletes the group by id', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'g1', name: 'Kalimantan' })

      await service.remove('g1')

      expect(groupRepo.delete).toHaveBeenCalledWith('g1')
    })
  })
})
