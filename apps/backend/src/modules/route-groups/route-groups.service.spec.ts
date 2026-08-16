import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

describe('RouteGroupsService', () => {
  let service: RouteGroupsService
  let dataSource: { query: jest.Mock }
  let groupRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let routeRepo: { delete: jest.Mock; insert: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    groupRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    routeRepo = { delete: jest.fn(), insert: jest.fn() }
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
  })

  describe('update', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Route group not found',
      )
    })
  })

  describe('remove', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.remove('missing')).rejects.toThrow('Route group not found')
    })
  })
})
