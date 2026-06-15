import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PnlSettlementController } from './pnl-settlement.controller'
import { PnlSettlementService } from './pnl-settlement.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

const mockService = {
  preview: jest.fn(),
  commit: jest.fn(),
  getSummary: jest.fn(),
  getToComparison: jest.fn(),
  getUnsettledTos: jest.fn(),
}

function fakeFile(name: string) {
  return { originalname: name, buffer: Buffer.from('x') }
}

describe('PnlSettlementController', () => {
  let controller: PnlSettlementController

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PnlSettlementController],
      providers: [{ provide: PnlSettlementService, useValue: mockService }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(PnlSettlementController)
    jest.clearAllMocks()
  })

  it('preview forwards the file buffer to the service', async () => {
    mockService.preview.mockResolvedValueOnce({ totalParsed: 1 })
    await controller.preview(fakeFile('inv.xlsx'))
    expect(mockService.preview).toHaveBeenCalledWith(expect.any(Buffer))
  })

  it('commit forwards the file buffer to the service', async () => {
    mockService.commit.mockResolvedValueOnce({ updated: 1 })
    await controller.commit(fakeFile('inv.csv'))
    expect(mockService.commit).toHaveBeenCalledWith(expect.any(Buffer))
  })

  it('rejects a missing file', () => {
    expect(() => controller.preview(undefined)).toThrow(BadRequestException)
  })

  it('rejects an unsupported file extension', () => {
    expect(() => controller.commit(fakeFile('inv.pdf'))).toThrow(BadRequestException)
  })

  it('getSummary forwards cycle + basis', async () => {
    mockService.getSummary.mockResolvedValueOnce({})
    await controller.getSummary('2026-03-1H', undefined, undefined, 'atd_origin')
    expect(mockService.getSummary).toHaveBeenCalledWith('2026-03-1H', undefined, undefined, 'atd_origin')
  })

  it('getToComparison forwards paging + settled filter', async () => {
    mockService.getToComparison.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getToComparison(2, 25, '2026-03-1H', undefined, undefined, undefined, 'unsettled')
    expect(mockService.getToComparison).toHaveBeenCalledWith(
      2, 25, '2026-03-1H', undefined, undefined, undefined, 'unsettled',
    )
  })
})
