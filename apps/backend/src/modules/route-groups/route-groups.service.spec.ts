import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

describe('RouteGroupsService', () => {
  let service: RouteGroupsService
  let dataSource: { query: jest.Mock }
  let groupRepo: { findOne: jest.Mock }
  let routeRepo: Record<string, jest.Mock>

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    groupRepo = { findOne: jest.fn() }
    routeRepo = {}
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
})
