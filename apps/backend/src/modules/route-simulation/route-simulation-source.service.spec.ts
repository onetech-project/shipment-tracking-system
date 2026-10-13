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
        weight: '6428', revenue: '198000000', cost_all: '120000000',
        lane_weight: '0', lane_cost_sg_out: '0', lane_cost_sg_in: '0', lane_cost_ra: '0', lane_cost_smu: '0' },
      { cycle: '2026-05-1H', origin: 'Jabo', dest: 'Aceh', vendor: 'PRIME', airline: 'Garuda Air CGK', awb_count: 8,
        weight: '1889', revenue: '58000000', cost_all: '41700000',
        lane_weight: '1889', lane_cost_sg_out: '1200000', lane_cost_sg_in: '1000000', lane_cost_ra: '1000000', lane_cost_smu: '38500000' },
    ])
    const src = await service.getSource()
    expect(src.cycles).toEqual(['2026-05-1H', '2026-05-2H'])
    expect(src.history[0]).toEqual({
      cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 36,
      weight: 6428, revenue: 198000000, costAll: 120000000,
      laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0,
    })
    expect(src.history[1]).toMatchObject({
      vendor: 'PRIME', laneWeight: 1889, laneCostSgOut: 1200000, laneCostSgIn: 1000000, laneCostRa: 1000000, laneCostSmu: 38500000,
    })
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

  it('splits known, booked lane cost into the four cost_to components, prorated by weight_share', async () => {
    arrange([], [], [])
    await service.getSource()
    const sql: string = dataSource.query.mock.calls[2][0]
    expect(sql).toContain('cost_sg_out_awb * weight_share')
    expect(sql).toContain('COALESCE(cost_sg_in_to, 0)')
    expect(sql).toContain('cost_ra_awb * weight_share')
    expect(sql).toContain('cost_smu_awb * weight_share')
    expect(sql).toContain('NOT is_cost_estimated AND cost_to IS NOT NULL')
    expect(sql).not.toMatch(/SUM\(cost_(smu|ra|sg_out)_awb\)/)
    expect(sql).not.toContain('lane_weight_smu')
  })
})
