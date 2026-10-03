import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteGroupsService } from '../route-groups/route-groups.service'

describe('RouteSimulationSourceService', () => {
  let service: RouteSimulationSourceService
  let dataSource: { query: jest.Mock }
  let routeGroups: { findAll: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    routeGroups = { findAll: jest.fn().mockResolvedValue([{ id: 'g1', name: 'Sumatera', description: null, routes: [] }]) }
    const module = await Test.createTestingModule({
      providers: [
        RouteSimulationSourceService,
        { provide: DataSource, useValue: dataSource },
        { provide: RouteGroupsService, useValue: routeGroups },
      ],
    }).compile()
    service = module.get(RouteSimulationSourceService)
  })

  // Order of dataSource.query calls inside getSource: routes, vendors, history.
  const arrange = (routes: unknown[], vendors: unknown[], history: unknown[]) => {
    dataSource.query
      .mockResolvedValueOnce(routes)
      .mockResolvedValueOnce(vendors)
      .mockResolvedValueOnce(history)
  }

  it('maps routes with numeric rates, the origin label and the hasData flag', async () => {
    arrange(
      [{ origin: 'Jabo', dest: 'Aceh', rate_spx: '32000', pph_2: '640', disc_15: '480', has_data: true },
       { origin: 'Medan', dest: 'Batam', rate_spx: null, pph_2: null, disc_15: null, has_data: false }],
      [], [],
    )
    const src = await service.getSource()
    expect(src.routes).toEqual([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', rateSpx: 32000, pph2: 640, disc15: 480, hasData: true },
      { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', rateSpx: null, pph2: null, disc15: null, hasData: false },
    ])
  })

  it('keeps unbooked history rows with a null vendor and derives ascending cycles', async () => {
    arrange([], [], [
      { cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awb_count: 36,
        weight: '6428', revenue: '198000000', cost_all: '120000000', cost_smu: '110000000',
        lane_weight_all: '0', lane_cost_all: '0', lane_weight_smu: '0', lane_cost_smu: '0' },
      { cycle: '2026-05-1H', origin: 'Jabo', dest: 'Aceh', vendor: 'PRIME', airline: 'Garuda Air CGK', awb_count: 8,
        weight: '1889', revenue: '58000000', cost_all: '41700000', cost_smu: '38500000',
        lane_weight_all: '1889', lane_cost_all: '41700000', lane_weight_smu: '1889', lane_cost_smu: '38500000' },
    ])
    const src = await service.getSource()
    expect(src.cycles).toEqual(['2026-05-1H', '2026-05-2H'])
    expect(src.history[0]).toEqual({
      cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 36,
      weight: 6428, revenue: 198000000, costAll: 120000000, costSmu: 110000000,
      laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,
    })
    expect(src.history[1].vendor).toBe('PRIME')
  })

  it('maps vendors and embeds route groups', async () => {
    arrange([], [{ vendor: 'ESP', in_master: true, has_data: true }], [])
    const src = await service.getSource()
    expect(src.vendors).toEqual([{ vendor: 'ESP', inMaster: true, hasData: true }])
    expect(src.routeGroups).toHaveLength(1)
    expect(routeGroups.findAll).toHaveBeenCalled()
  })

  it('groups history on the cycle column of the requested basis, defaulting to date', async () => {
    arrange([], [], [])
    const def = await service.getSource()
    expect(def.basis).toBe('date')
    expect(dataSource.query.mock.calls[2][0]).toContain('cycle_date')

    arrange([], [], [])
    const atd = await service.getSource('atd_origin')
    expect(atd.basis).toBe('atd_origin')
    expect(dataSource.query.mock.calls[5][0]).toContain('cycle_atd')
  })

  it('prorates AWB-grain SMU cost by weight_share and excludes estimated cost from lane cost', async () => {
    arrange([], [], [])
    await service.getSource()
    const sql: string = dataSource.query.mock.calls[2][0]
    expect(sql).toContain('cost_smu_awb * weight_share')
    expect(sql).toContain('NOT is_cost_estimated')
    expect(sql).not.toMatch(/SUM\(cost_smu_awb\)/)
  })
})
