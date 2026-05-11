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

  @Get('daily-margin')
  getDailyMargin(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getDailyMargin(cycle, start, end)
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

  @Get('breakdown/revenue-by-route')
  getRevenueByRoute(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getRevenueByRoute(cycle, start, end)
  }

  @Get('breakdown/cost-totals')
  getCostTotals(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getCostTotals(cycle, start, end)
  }

  @Get('breakdown/cost-by-vendor')
  getCostByVendor(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getCostByVendor(cycle, start, end)
  }

  @Get('breakdown/cost-by-ra')
  getCostByRa(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getCostByRa(cycle, start, end)
  }

  @Get('breakdown/cost-by-sg-out')
  getCostBySgOut(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getCostBySgOut(cycle, start, end)
  }

  @Get('breakdown/cost-by-sg-in')
  getCostBySgIn(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getCostBySgIn(cycle, start, end)
  }

  @Get('breakdown/profit-by-route')
  getProfitByRoute(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.pnlService.getProfitByRoute(cycle, start, end)
  }
}
