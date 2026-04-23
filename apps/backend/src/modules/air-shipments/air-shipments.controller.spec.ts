import { AirShipmentsController } from './air-shipments.controller'
import { AirShipmentsService } from './air-shipments.service'
import { AirShipmentQueryDto } from './dto/air-shipment-query.dto'

describe('AirShipmentsController', () => {
  let controller: AirShipmentsController
  let service: Partial<Record<keyof AirShipmentsService, jest.Mock>>

  beforeEach(() => {
    service = {
      getAlertSummaryForTable: jest.fn().mockResolvedValue({
        slaAlert: 0,
        tjphAlert: 0,
        ataFlightAlert: 0,
        atdFlightAlert: 0,
        smuAlert: 0,
      }),
      createGoogleSheetConfig: jest.fn().mockResolvedValue({ id: 'cfg-1' }),
      findAllForTable: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    } as any

    controller = new AirShipmentsController(service as any)
  })

  it('getAlertSummary delegates to service.getAlertSummaryForTable', async () => {
    await controller.getAlertSummary('air_shipments_cgk')
    expect(service.getAlertSummaryForTable).toHaveBeenCalledWith('air_shipments_cgk')
  })

  it('findAllDynamic delegates to service.findAllForTable with query', async () => {
    const dto: AirShipmentQueryDto = {
      page: 1,
      limit: 10,
      sortBy: 'id',
      sortOrder: 'asc',
      alertFilter: 'slaAlert',
    }

    await controller.findAllDynamic('air_shipments_cgk', dto)
    expect(service.findAllForTable).toHaveBeenCalledWith('air_shipments_cgk', dto)
  })
})
