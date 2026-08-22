import { Test } from '@nestjs/testing'
import { PATH_METADATA } from '@nestjs/common/constants'
import { PnlController } from './pnl.controller'
import { PnlService } from './pnl.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

const mockService = {
  getCycles: jest.fn(),
  getStations: jest.fn(),
  getSummary: jest.fn(),
  getTrend: jest.fn(),
  getAwbDrilldown: jest.fn(),
  getDataQuality: jest.fn(),
  getDailyMatrix: jest.fn(),
  getRouteComparison: jest.fn(),
}

describe('PnlController', () => {
  let controller: PnlController

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PnlController],
      providers: [{ provide: PnlService, useValue: mockService }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(PnlController)
    jest.clearAllMocks()
  })

  it('getCycles delegates to service', async () => {
    mockService.getCycles.mockResolvedValueOnce(['2026-04-2H'])
    expect(await controller.getCycles()).toEqual(['2026-04-2H'])
  })

  it('getStations delegates to service', async () => {
    mockService.getStations.mockResolvedValueOnce([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    ])
    expect(await controller.getStations()).toEqual([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    ])
  })

  it('getSummary passes cycle + basis query params', async () => {
    mockService.getSummary.mockResolvedValueOnce({ cyclePeriod: '2026-04-2H' })
    await controller.getSummary('2026-04-2H', undefined, undefined, 'atd_origin')
    expect(mockService.getSummary).toHaveBeenCalledWith('2026-04-2H', undefined, undefined, 'atd_origin')
  })

  it('getCycles passes basis through', async () => {
    mockService.getCycles.mockResolvedValueOnce(['2026-05-1H'])
    await controller.getCycles('atd_origin')
    expect(mockService.getCycles).toHaveBeenCalledWith('atd_origin')
  })

  it('getAwbDrilldown defaults page=1 limit=50 and forwards basis', async () => {
    mockService.getAwbDrilldown.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'ata_vendor_wh_destination')
    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, 'ata_vendor_wh_destination',
      { routes: [], dateFrom: undefined, dateTo: undefined },
    )
  })

  it('getDataQuality passes page/limit', async () => {
    mockService.getDataQuality.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getDataQuality(2, 25)
    expect(mockService.getDataQuality).toHaveBeenCalledWith(2, 25)
  })

  it('getDailyMatrix forwards cycle, range and basis to the service', async () => {
    mockService.getDailyMatrix.mockResolvedValueOnce({ columns: [], rows: [], footer: [], periodDays: 15 })
    const result = await controller.getDailyMatrix('2026-07-1H', undefined, undefined, 'atd_origin')
    expect(mockService.getDailyMatrix).toHaveBeenCalledWith('2026-07-1H', undefined, undefined, 'atd_origin')
    expect(result.periodDays).toBe(15)
  })

  it('getAwbDrilldown parses the routes param into pairs', async () => {
    await controller.getAwbDrilldown(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      'Jabo|Denpasar,Surabaya|Pontianak', '2026-04-20', '2026-04-21',
    )

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      {
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Pontianak' },
        ],
        dateFrom: '2026-04-20',
        dateTo: '2026-04-21',
      },
    )
  })

  it('getAwbDrilldown sends an empty route list when the param is absent', async () => {
    await controller.getAwbDrilldown(1, 50, '2026-04-2H')

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      { routes: [], dateFrom: undefined, dateTo: undefined },
    )
  })

  describe('getRouteComparison', () => {
    it('parses mixed group and route descriptors in pick order', async () => {
      await controller.getRouteComparison(
        `g:11111111-1111-4111-8111-111111111111,r:Jabo|Denpasar`,
        '2026-05-1H',
      )

      expect(mockService.getRouteComparison).toHaveBeenCalledWith(
        [
          { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
          { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
        ],
        '2026-05-1H',
        undefined,
        undefined,
        undefined,
      )
    })

    it('sends an empty pick list when the columns param is absent', async () => {
      await controller.getRouteComparison(undefined, '2026-05-1H')

      expect(mockService.getRouteComparison).toHaveBeenCalledWith(
        [], '2026-05-1H', undefined, undefined, undefined,
      )
    })
  })
})

describe('route aliases', () => {
  it('serves the comparison endpoint under both the new and the legacy path', () => {
    const paths = Reflect.getMetadata(
      PATH_METADATA,
      PnlController.prototype.getRouteComparison,
    )

    expect(paths).toEqual(
      expect.arrayContaining(['breakdown/route-comparison', 'breakdown/group-comparison']),
    )
  })
})
