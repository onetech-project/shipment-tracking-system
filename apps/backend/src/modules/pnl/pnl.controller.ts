import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PnlService } from './pnl.service'

@Controller('pnl')
@UseGuards(JwtAuthGuard)
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('cycles')
  getCycles() {
    return this.pnlService.getCycles()
  }

  @Get('summary')
  getSummary(@Query('cycle') cycle: string) {
    return this.pnlService.getSummary(cycle)
  }

  @Get('trend')
  getTrend() {
    return this.pnlService.getTrend()
  }

  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('cycle') cycle: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.pnlService.getAwbDrilldown(cycle, page, limit)
  }

  @Get('data-quality')
  getDataQuality() {
    return this.pnlService.getDataQuality()
  }
}
