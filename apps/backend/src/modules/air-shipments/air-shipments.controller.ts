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

@Controller('air-shipments')
@UseGuards(JwtAuthGuard)
export class AirShipmentsController {
  private readonly logger = new Logger(AirShipmentsController.name)

  constructor(private readonly service: AirShipmentsService) {}

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

  @Get(':tableName/alert-summary')
  async getAlertSummary(@Param('tableName') tableName: string) {
    try {
      return await this.service.getAlertSummaryForTable(tableName)
    } catch (err: unknown) {
      this.logger.error(
        `[GET /air-shipments/${tableName}/alert-summary]`,
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
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
