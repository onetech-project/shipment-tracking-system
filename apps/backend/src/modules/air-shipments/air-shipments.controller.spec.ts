import { Test, TestingModule } from '@nestjs/testing'
import { AirShipmentsController } from './air-shipments.controller'
import { AirShipmentsService } from './air-shipments.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { AirShipmentQueryDto } from './dto/air-shipment-query.dto'

describe('AirShipmentsController', () => {
  let controller: AirShipmentsController
  let service: Partial<Record<keyof AirShipmentsService, jest.Mock>>

  beforeEach(async () => {
    service = {
      findAllCgk: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      createGoogleSheetConfig: jest.fn().mockResolvedValue({ id: 'cfg-1' }),
      findAllForTable: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    } as any

    // Instantiate controller directly to avoid Nest guard DI in unit tests
    controller = new AirShipmentsController(service as any)
  })

  it('findAllCgk delegates to service', async () => {
    const dto: AirShipmentQueryDto = { page: 1, limit: 10, sortBy: 'id', sortOrder: 'asc' }
    await controller.findAllCgk(dto)
    expect(service.findAllCgk).toHaveBeenCalledWith(dto)
  })

  it('createGoogleSheetConfig delegates to service', async () => {
    const dto = { sheetLink: 'https://docs.google.com/spreadsheets/d/ABC', syncInterval: 15, enabled: true }
    const res = await controller.createGoogleSheetConfig(dto as any)
    expect(service.createGoogleSheetConfig).toHaveBeenCalledWith(dto)
    expect(res).toEqual({ id: 'cfg-1' })
  })

  it('findAllDynamic delegates to service.findAllForTable', async () => {
    const dto: AirShipmentQueryDto = { page: 1, limit: 10, sortBy: 'id', sortOrder: 'asc' }
    await controller.findAllDynamic('air_shipments_cgk', dto)
    expect(service.findAllForTable).toHaveBeenCalledWith('air_shipments_cgk', dto)
  })
})
