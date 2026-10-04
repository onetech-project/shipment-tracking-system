import { ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'

const row = (over: Partial<RouteSimulationScenarioEntity> = {}): RouteSimulationScenarioEntity => ({
  id: 's1', name: 'Baseline', description: null, payload: { version: 1 }, revision: 2,
  updatedBy: 'u1', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
  ...over,
})

describe('RouteSimulationScenariosService', () => {
  let service: RouteSimulationScenariosService
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; delete: jest.Mock }
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => row({ ...v, id: 's-new', revision: 1 })),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: 1 })),
    }
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        RouteSimulationScenariosService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(RouteSimulationScenarioEntity), useValue: repo },
      ],
    }).compile()
    service = module.get(RouteSimulationScenariosService)
  })

  it('lists summaries without payloads, newest first, with the editor username', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 's1', name: 'Baseline', description: null, revision: 2, updated_at: new Date('2026-10-02T00:00:00Z'), username: 'faris' },
    ])
    await expect(service.findAll()).resolves.toEqual([
      { id: 's1', name: 'Baseline', description: null, revision: 2, updatedAt: '2026-10-02T00:00:00.000Z', updatedBy: 'faris' },
    ])
    expect(dataSource.query.mock.calls[0][0]).not.toContain('payload')
  })

  it('throws 404 for a missing scenario', async () => {
    dataSource.query.mockResolvedValueOnce([])
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('creates with a trimmed name and the acting user', async () => {
    repo.findOne.mockResolvedValueOnce(null)
    dataSource.query.mockResolvedValueOnce([{ ...row({ id: 's-new', name: 'Okt', revision: 1 }), updated_at: new Date(), username: 'faris' }])
    await service.create({ name: '  Okt  ', payload: { version: 1 } }, 'u1')
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Okt', updatedBy: 'u1', revision: 1 }))
  })

  it('refuses a duplicate name with 409', async () => {
    repo.findOne.mockResolvedValueOnce(row())
    await expect(service.create({ name: 'Baseline', payload: {} }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses a payload over 90 KB with 413', async () => {
    const payload = { blob: 'x'.repeat(91 * 1024) }
    await expect(service.create({ name: 'Big', payload }, 'u1')).rejects.toBeInstanceOf(PayloadTooLargeException)
  })

  it('maps a save-time unique violation (lost the race after the pre-check) to 409', async () => {
    repo.findOne.mockResolvedValueOnce(null)
    repo.save.mockRejectedValueOnce({ code: '23505', constraint: 'uq_route_simulation_scenarios_name' })
    await expect(service.create({ name: 'Baseline', payload: {} }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('propagates an unrelated save error unchanged', async () => {
    repo.findOne.mockResolvedValueOnce(null)
    repo.save.mockRejectedValueOnce(new Error('boom'))
    await expect(service.create({ name: 'Baseline', payload: {} }, 'u1')).rejects.toThrow('boom')
  })

  it('updates only when the revision matches, bumping it by one', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 2 })) // existence
    dataSource.query
      .mockResolvedValueOnce([{ id: 's1' }]) // the guarded UPDATE ... RETURNING
      .mockResolvedValueOnce([{ ...row({ revision: 3 }), updated_at: new Date(), username: 'faris' }])
    const out = await service.update('s1', { revision: 2, payload: { version: 1, x: 1 } }, 'u1')
    expect(out.revision).toBe(3)
    const [sql, params] = dataSource.query.mock.calls[0]
    expect(sql).toContain('revision = revision + 1')
    expect(sql).toContain('WHERE id = $1 AND revision = $2')
    expect(params.slice(0, 2)).toEqual(['s1', 2])
  })

  it('returns 409 when someone saved in between', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 3 }))
    dataSource.query.mockResolvedValueOnce([]) // UPDATE matched no row
    await expect(service.update('s1', { revision: 2, name: 'x' }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('maps a unique violation from the UPDATE itself to 409', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 2 }))
    dataSource.query.mockRejectedValueOnce({ code: '23505', constraint: 'uq_route_simulation_scenarios_name' })
    await expect(service.update('s1', { revision: 2, name: 'Taken' }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('binds a null description and includes it in the SET clause when explicitly cleared', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 2 }))
    dataSource.query
      .mockResolvedValueOnce([{ id: 's1' }])
      .mockResolvedValueOnce([{ ...row({ revision: 3, description: null }), updated_at: new Date(), username: 'faris' }])
    await service.update('s1', { revision: 2, description: null }, 'u1')
    const [sql, params] = dataSource.query.mock.calls[0]
    expect(sql).toContain('description = $4')
    expect(params).toEqual(['s1', 2, 'u1', null])
  })

  it('omits the description clause entirely when description is not provided', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 2 }))
    dataSource.query
      .mockResolvedValueOnce([{ id: 's1' }])
      .mockResolvedValueOnce([{ ...row({ revision: 3 }), updated_at: new Date(), username: 'faris' }])
    await service.update('s1', { revision: 2, name: 'Renamed' }, 'u1')
    const [sql, params] = dataSource.query.mock.calls[0]
    expect(sql).not.toContain('description =')
    expect(params).toEqual(['s1', 2, 'u1', 'Renamed'])
  })

  it('deletes and 404s when nothing was removed', async () => {
    await service.remove('s1')
    expect(repo.delete).toHaveBeenCalledWith({ id: 's1' })
    repo.delete.mockResolvedValueOnce({ affected: 0 })
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
