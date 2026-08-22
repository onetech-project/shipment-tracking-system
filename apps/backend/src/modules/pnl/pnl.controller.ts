import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { Permission } from '@shared/auth'
import { PnlService } from './pnl.service'
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'
import { parseVendorColumnPicks, parseVendorNames } from './pnl-vendor-columns.util'

@ApiTags('PnL')
@Controller('pnl')
@UseGuards(JwtAuthGuard)
@Authorize(Permission.READ_PNL)
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('cycles')
  getCycles(@Query('basis') basis?: string) {
    return this.pnlService.getCycles(basis)
  }

  @Get('stations')
  getStations() {
    return this.pnlService.getStations()
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
    @Query('routes') routes?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end, basis, {
      routes: parseRoutePairs(routes),
      dateFrom,
      dateTo,
    })
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

  @Get('breakdown/daily-matrix')
  getDailyMatrix(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getDailyMatrix(cycle, start, end, basis)
  }

  // Two paths, one handler. `group-comparison` is the legacy name kept alive for one release so a
  // frontend that has not yet been redeployed keeps working — frontend and backend roll out in
  // parallel. Remove the legacy entry only after the release carrying the rename is fully out.
  @Get(['breakdown/route-comparison', 'breakdown/group-comparison'])
  getRouteComparison(
    @Query('columns') columns?: string,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getRouteComparison(parseColumnPicks(columns), cycle, start, end, basis)
  }

  // No method-level @Authorize. RbacGuard resolves permissions with getAllAndOverride([handler,
  // class]), so a method-level decorator would REPLACE the class-level read.pnl rather than add to
  // it — this endpoint would then stop requiring read.pnl. The read.vendor_group gate is a UI-side
  // gate on the tab; what is genuinely guarded server-side is /vendor-groups itself.
  //
  // `columns` repeats: qs gives a string for one occurrence and an array for two or more, so the
  // parameter is typed for both and the parser normalises before iterating.
  @Get('breakdown/vendor-comparison')
  getVendorComparison(
    @Query('columns') columns?: string | string[],
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getVendorComparison(
      parseVendorColumnPicks(columns),
      cycle,
      start,
      end,
      basis,
    )
  }
}
