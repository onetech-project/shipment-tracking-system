import { Test } from '@nestjs/testing'
import { PnlController } from './pnl.controller'
import { PnlService } from './pnl.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

const mockService = {
  getCycles: jest.fn(),
  getSummary: jest.fn(),
  getTrend: jest.fn(),
  getAwbDrilldown: jest.fn(),
  getDataQuality: jest.fn(),
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

  it('getSummary passes cycle query param', async () => {
    mockService.getSummary.mockResolvedValueOnce({ cyclePeriod: '2026-04-2H' })
    await controller.getSummary('2026-04-2H')
    expect(mockService.getSummary).toHaveBeenCalledWith('2026-04-2H', undefined, undefined)
  })

  it('getAwbDrilldown defaults page=1 limit=50', async () => {
    mockService.getAwbDrilldown.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getAwbDrilldown(1, 50, '2026-04-2H')
    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(1, 50, '2026-04-2H', undefined, undefined)
  })
})
