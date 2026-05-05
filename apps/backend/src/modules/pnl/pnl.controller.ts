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
  getSummary(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getSummary(cycle, start, end)
  }

  @Get('trend')
  getTrend() {
    return this.pnlService.getTrend()
  }

  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end)
  }

  @Get('awb-tos')
  getAwbTos(
    @Query('awb') awb: string,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getAwbTos(awb, cycle, start, end)
  }

  @Get('data-quality')
  getDataQuality() {
    return this.pnlService.getDataQuality()
  }
}
