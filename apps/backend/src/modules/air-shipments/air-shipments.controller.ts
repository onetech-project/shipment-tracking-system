import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  InternalServerErrorException,
  Patch,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AirShipmentsService } from './air-shipments.service'
import { AirShipmentQueryDto } from './dto/air-shipment-query.dto'
import { Body, Post, Put, Delete, Param } from '@nestjs/common'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { Authorize, PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { GoogleSheetConfigDto } from './dto/google-sheet-config.dto'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { Permission } from '@shared/auth'
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { ExcludedQueryDto, ExcludeRowDto, RestoreRowDto, ExcludeByLtDto, RestoreByLtDto } from './dto/excluded-query.dto'
import { SlaColumnLayoutDto } from './dto/sla-column-layout.dto'
import { OffloadedAwbQueryDto, SetEvidenceDto } from './dto/tracking-smu.dto'
import { AirlineTrackingSourceService, AirlineSource } from './airline-tracking/airline-tracking-source.service'
import { AirlineTrackingService } from './airline-tracking/airline-tracking.service'
import { CreateAirlineSourceDto, UpdateAirlineSourceDto } from './airline-tracking/dto/airline-source.dto'

@Controller('air-shipments')
@UseGuards(JwtAuthGuard)
export class AirShipmentsController {
  private readonly logger = new Logger(AirShipmentsController.name)

  constructor(
    private readonly service: AirShipmentsService,
    private readonly airlineSources: AirlineTrackingSourceService,
    private readonly airlineTracking: AirlineTrackingService,
  ) {}

  @Get('google-sheet-config')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_GOOGLE_SHEET_CONFIG)
  async getGoogleSheetConfig(): Promise<GoogleSheetConfig[]> {
    return this.service.getGoogleSheetConfig()
  }

  @Post('google-sheet-config')
  @UseGuards(RbacGuard)
  @Authorize(Permission.CREATE_GOOGLE_SHEET_CONFIG)
  async createGoogleSheetConfig(
    @Body() dto: GoogleSheetConfigDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<GoogleSheetConfig> {
    return this.service.createGoogleSheetConfig(dto, user.id)
  }

  @Put('google-sheet-config/:id')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_GOOGLE_SHEET_CONFIG)
  async updateGoogleSheetConfig(
    @Param('id') id: string,
    @Body() dto: GoogleSheetConfigDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<GoogleSheetConfig> {
    return this.service.updateGoogleSheetConfig(id, dto, user.id)
  }

  @Delete('google-sheet-config/:id')
  @UseGuards(RbacGuard)
  @Authorize(Permission.DELETE_GOOGLE_SHEET_CONFIG)
  async deleteGoogleSheetConfig(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<void> {
    return this.service.deleteGoogleSheetConfig(id, user.id)
  }

  @Patch(':tableName/:id/lock')
  async lockRow(
    @Param('tableName') tableName: string,
    @Param('id') id: string,
    @Body('locked') locked: boolean,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<string> {
    return this.service.lockRow(tableName, id, locked, user?.id)
  }

  @Post(':tableName/batch-lock')
  async batchLock(
    @Param('tableName') tableName: string,
    @Body() body: { start: string; end: string; locked?: boolean },
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<{ affected: number }> {
    const affected = await this.service.batchLockByDate(
      tableName,
      body.start,
      body.end,
      Boolean(body.locked),
      user?.id
    )
    return { affected }
  }

  @Post(':tableName/batch-delete')
  async batchDelete(
    @Param('tableName') tableName: string,
    @Body() body: { start: string; end: string },
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<{ deleted: number }> {
    try {
      const deleted = await this.service.batchDeleteByDate(
        tableName,
        body.start,
        body.end,
        user?.id
      )
      return { deleted }
    } catch (err: unknown) {
      this.logger.error(
        `[POST /air-shipments/${tableName}/batch-delete]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Post(':tableName/batch-count')
  async batchCount(
    @Param('tableName') tableName: string,
    @Body() body: { start: string; end: string }
  ): Promise<{ count: number }> {
    const count = await this.service.batchCountByDate(tableName, body.start, body.end)
    return { count }
  }

  @Get(':tableName/alert-summary')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getAlertSummary(
    @Param('tableName') tableName: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    const daysNum = days != null && !isNaN(Number(days)) ? Number(days) : undefined
    try {
      return await this.service.getAlertSummaryForTable(tableName, startDate, endDate, daysNum)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}/alert-summary]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Get(':tableName/routes')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getRoutes(
    @Param('tableName') tableName: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    const daysNum = days != null && !isNaN(Number(days)) ? Number(days) : undefined
    try {
      return await this.service.getRoutesForTable(tableName, startDate, endDate, daysNum)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}/routes]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Get(':tableName/route-alert-summary')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getRouteAlertSummary(
    @Param('tableName') tableName: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    const daysNum = days != null && !isNaN(Number(days)) ? Number(days) : undefined
    try {
      return await this.service.getRouteAlertSummary(tableName, startDate, endDate, daysNum)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}/route-alert-summary]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Get(':tableName/sla-overview')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getSlaOverview(
    @Param('tableName') tableName: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    const daysNum = days != null && !isNaN(Number(days)) ? Number(days) : undefined
    try {
      return await this.service.getSlaOverviewForTable(tableName, startDate, endDate, daysNum)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}/sla-overview]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Get('last-sync')
  getLastSyncAt() {
    return this.service.getLastSyncAt()
  }

  // ── SLA column layout (single app-wide config) ────────────────────────────────
  // Literal paths declared above the catch-all `:tableName`.

  @Get('sla-column-layout')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getSlaColumnLayout(): Promise<{ layout: Array<{ key: string; visible: boolean; frozen: boolean }> }> {
    return { layout: await this.service.getSlaColumnLayout() }
  }

  @Put('sla-column-layout')
  async setSlaColumnLayout(
    @Body() body: SlaColumnLayoutDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ layout: SlaColumnLayoutDto['layout'] }> {
    await this.service.setSlaColumnLayout(body.layout, user?.id)
    return { layout: body.layout }
  }

  @Get(':tableName/excluded')
  async getExcluded(
    @Param('tableName') tableName: string,
    @Query() query: ExcludedQueryDto
  ): Promise<{
    data: Record<string, unknown>[]
    meta: { total: number; page: number; limit: number }
  }> {
    return this.service.findExcludedRows(tableName, query)
  }

  @Patch(':tableName/:id/exclude')
  async excludeRow(
    @Param('tableName') tableName: string,
    @Param('id') id: string,
    @Body() body: ExcludeRowDto
  ): Promise<void> {
    return this.service.excludeRow(tableName, id, body.alertType, body.reason)
  }

  @Patch(':tableName/:id/restore')
  async restoreRow(
    @Param('tableName') tableName: string,
    @Param('id') id: string,
    @Body() body: RestoreRowDto
  ): Promise<void> {
    return this.service.restoreRow(tableName, id, body.alertType)
  }

  // Exclude/restore by lt_number from above the table (global — hides from every alert type).
  // 2-segment paths; declared before the catch-all GET `:tableName`.
  @Patch(':tableName/exclude-by-lt')
  async excludeByLt(
    @Param('tableName') tableName: string,
    @Body() body: ExcludeByLtDto
  ): Promise<{ affected: number }> {
    const affected = await this.service.excludeByLt(
      tableName,
      body.ltNumbers,
      body.alertType,
      body.reason
    )
    return { affected }
  }

  @Patch(':tableName/restore-by-lt')
  async restoreByLt(
    @Param('tableName') tableName: string,
    @Body() body: RestoreByLtDto
  ): Promise<{ affected: number }> {
    const affected = await this.service.restoreByLt(tableName, body.ltNumbers, body.alertType)
    return { affected }
  }

  // ── Tracking_SMU offload alert (per-AWB) ──────────────────────────────────────
  // Literal `tracking-smu/...` paths, declared above the catch-all `:tableName`.

  @Get('tracking-smu/offloaded')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getOffloadedAwbs(@Query() query: OffloadedAwbQueryDto): Promise<{
    data: Record<string, unknown>[]
    meta: { total: number; page: number; limit: number }
  }> {
    return this.service.findOffloadedAwbs(query)
  }

  @Patch('tracking-smu/awb/:awb/evidence')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_TRACKING_SMU)
  async setAwbEvidence(
    @Param('awb') awb: string,
    @Body() body: SetEvidenceDto
  ): Promise<void> {
    return this.service.setEvidenceByAwb(awb, body.evidence)
  }

  @Delete('tracking-smu/awb/:awb/evidence')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_TRACKING_SMU)
  async clearAwbEvidence(@Param('awb') awb: string): Promise<void> {
    return this.service.clearEvidenceByAwb(awb)
  }

  // ── Airline tracking source registry (carrier_code → endpoint config) ─────────

  @Get('airline-sources')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async listAirlineSources(): Promise<AirlineSource[]> {
    return this.airlineSources.list()
  }

  @Post('airline-sources')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_AIRLINE_TRACKING_SOURCE)
  async createAirlineSource(@Body() dto: CreateAirlineSourceDto): Promise<AirlineSource> {
    return this.airlineSources.create(dto)
  }

  @Put('airline-sources/:carrierCode')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_AIRLINE_TRACKING_SOURCE)
  async updateAirlineSource(
    @Param('carrierCode') carrierCode: string,
    @Body() dto: UpdateAirlineSourceDto
  ): Promise<AirlineSource> {
    return this.airlineSources.update(carrierCode, dto)
  }

  @Delete('airline-sources/:carrierCode')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_AIRLINE_TRACKING_SOURCE)
  async deleteAirlineSource(@Param('carrierCode') carrierCode: string): Promise<void> {
    return this.airlineSources.remove(carrierCode)
  }

  /** Manually trigger an airline-API DEP refresh cycle (useful for testing). */
  @Post('airline-tracking/refresh')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_AIRLINE_TRACKING_SOURCE)
  async refreshAirlineTracking() {
    return this.airlineTracking.refreshRecentActive()
  }

  @Get(':tableName')
  async findAllDynamic(@Param('tableName') tableName: string, @Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllForTable(tableName, query as any)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }
}
