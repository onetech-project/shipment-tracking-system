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

@Controller('air-shipments')
@UseGuards(JwtAuthGuard)
export class AirShipmentsController {
  private readonly logger = new Logger(AirShipmentsController.name)

  constructor(private readonly service: AirShipmentsService) {}

  @Get('cgk')
  async findAllCgk(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllCgk(query)
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/cgk]', err instanceof Error ? err.stack : String(err))
      throw new InternalServerErrorException()
    }
  }

  @Get('sub')
  async findAllSub(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllSub(query)
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/sub]', err instanceof Error ? err.stack : String(err))
      throw new InternalServerErrorException()
    }
  }

  @Get('sda')
  async findAllSda(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllSda(query)
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/sda]', err instanceof Error ? err.stack : String(err))
      throw new InternalServerErrorException()
    }
  }

  @Get('rate')
  async findAllRate(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllRate(query)
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/rate]', err instanceof Error ? err.stack : String(err))
      throw new InternalServerErrorException()
    }
  }

  @Get('routes')
  async findAllRoutes(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllRoutes(query)
    } catch (err: unknown) {
      this.logger.error(
        '[GET /air-shipments/routes]',
        err instanceof Error ? err.stack : String(err)
      )
      throw new InternalServerErrorException()
    }
  }

  @Get('google-sheet-config')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_GOOGLE_SHEET_CONFIG)
  async getGoogleSheetConfig(): Promise<GoogleSheetConfig[]> {
    return this.service.getGoogleSheetConfig()
  }

  @Post('google-sheet-config')
  @UseGuards(RbacGuard)
  @Authorize(Permission.CREATE_GOOGLE_SHEET_CONFIG)
  async createGoogleSheetConfig(@Body() dto: GoogleSheetConfigDto): Promise<GoogleSheetConfig> {
    return this.service.createGoogleSheetConfig(dto)
  }

  @Put('google-sheet-config/:id')
  @UseGuards(RbacGuard)
  @Authorize(Permission.UPDATE_GOOGLE_SHEET_CONFIG)
  async updateGoogleSheetConfig(
    @Param('id') id: string,
    @Body() dto: GoogleSheetConfigDto
  ): Promise<GoogleSheetConfig> {
    return this.service.updateGoogleSheetConfig(id, dto)
  }

  @Delete('google-sheet-config/:id')
  @UseGuards(RbacGuard)
  @Authorize(Permission.DELETE_GOOGLE_SHEET_CONFIG)
  async deleteGoogleSheetConfig(@Param('id') id: string): Promise<void> {
    return this.service.deleteGoogleSheetConfig(id)
  }

  @Patch(':tableName/:id/lock')
  async lockRow(
    @Param('tableName') tableName: string,
    @Param('id') id: string,
    @Body('locked') locked: boolean
  ): Promise<string> {
    return this.service.lockRow(tableName, id, locked)
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
