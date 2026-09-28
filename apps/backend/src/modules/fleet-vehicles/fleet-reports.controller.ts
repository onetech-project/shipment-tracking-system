import { Controller, Get, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetSummaryService } from './fleet-summary.service'
import { todayISO } from './fleet-severity'

// A controller of its own rather than two more routes on FleetVehiclesController: both of these
// live at /fleet, not /fleet/vehicles, and a GET 'summary' added under the vehicles controller
// would be shadowed by its own GET ':id' route.
@ApiTags('Fleet Reports')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetReportsController {
  constructor(private readonly service: FleetSummaryService) {}

  @Get('summary')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  summary() {
    return this.service.summary()
  }

  @Get('export.csv')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  async exportCsv(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const csv = await this.service.exportCsv()
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="armada-${todayISO()}.csv"`,
    })
    return new StreamableFile(Buffer.from(csv, 'utf-8'))
  }
}
