import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { Permission } from '@shared/auth'
import { PnlService } from './pnl.service'

@Controller('pnl')
@UseGuards(JwtAuthGuard)
@Authorize(Permission.READ_PNL)
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('cycles')
  getCycles(@Query('basis') basis?: string) {
    return this.pnlService.getCycles(basis)
  }

  @Get('summary')
  getSummary(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getSummary(cycle, start, end, basis)
  }

  @Get('daily-margin')
  getDailyMargin(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getDailyMargin(cycle, start, end, basis)
  }

  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end, basis)
  }

  @Get('awb-tos')
  getAwbTos(
    @Query('awb') awb: string,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getAwbTos(awb, cycle, start, end, basis)
  }

  @Get('data-quality')
  getDataQuality(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.pnlService.getDataQuality(page, limit)
  }

  @Get('data-quality/summary')
  getDataQualitySummary() {
    return this.pnlService.getDataQualitySummary()
  }

  @Get('breakdown/revenue-by-route')
  getRevenueByRoute(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getRevenueByRoute(cycle, start, end, basis)
  }

  @Get('breakdown/cost-totals')
  getCostTotals(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getCostTotals(cycle, start, end, basis)
  }

  @Get('breakdown/cost-by-vendor')
  getCostByVendor(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getCostByVendor(cycle, start, end, basis)
  }

  @Get('breakdown/cost-by-ra')
  getCostByRa(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getCostByRa(cycle, start, end, basis)
  }

  @Get('breakdown/cost-by-sg-out')
  getCostBySgOut(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getCostBySgOut(cycle, start, end, basis)
  }

  @Get('breakdown/cost-by-sg-in')
  getCostBySgIn(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getCostBySgIn(cycle, start, end, basis)
  }

  @Get('breakdown/profit-by-route')
  getProfitByRoute(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getProfitByRoute(cycle, start, end, basis)
  }
}
