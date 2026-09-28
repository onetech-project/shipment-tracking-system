import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetReportsController } from './fleet-reports.controller'
import { FleetSummaryService } from './fleet-summary.service'

describe('FleetReportsController', () => {
  let controller: FleetReportsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      summary: jest.fn(async () => ({ totalUnit: 8 })),
      exportCsv: jest.fn(async () => '﻿Nomor Polisi\r\nB 1 A'),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetReportsController],
      providers: [{ provide: FleetSummaryService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetReportsController)
  })

  it('reports the summary', async () => {
    await expect(controller.summary()).resolves.toEqual({ totalUnit: 8 })
  })

  it('sends the CSV as a dated attachment', async () => {
    const set = jest.fn()
    const file = await controller.exportCsv({ set } as never)

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': expect.stringMatching(
          /attachment; filename="armada-\d{4}-\d{2}-\d{2}\.csv"/,
        ),
      }),
    )
    expect(file.getStream).toBeDefined()
  })

  it.each([
    ['summary', Permission.READ_FLEET_VEHICLE],
    ['exportCsv', Permission.READ_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const meta = Reflect.getMetadata(
      PERMISSION_KEY,
      (FleetReportsController.prototype as unknown as Record<string, never>)[method],
    )
    expect(meta).toBe(permission)
  })
})
