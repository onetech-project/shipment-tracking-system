import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { Permission } from '@shared/auth'
import { BarhalService } from './barhal.service'
import { CreateBarhalKoliDto } from './dto/create-barhal-koli.dto'
import { AttachTosDto } from './dto/attach-tos.dto'
import { UpdatePackingDto } from './dto/update-packing.dto'
import { UpdateSmuDto } from './dto/update-smu.dto'
import { BulkUpdateSmuDto } from './dto/bulk-update-smu.dto'
import { ListBarhalKoliDto } from './dto/list-barhal-koli.dto'
import { AvailableToDto } from './dto/available-to.dto'
import { BarhalDashboardQueryDto } from './dto/barhal-dashboard-query.dto'

@ApiTags('Barhal')
@Controller('barhal')
@UseGuards(JwtAuthGuard)
export class BarhalController {
  constructor(private readonly service: BarhalService) {}

  @Get('stations')
  @Authorize(Permission.READ_BARHAL)
  getStations() {
    return this.service.getStations()
  }

  @Get('available-tos')
  @Authorize(Permission.READ_BARHAL)
  getAvailableTos(@Query() dto: AvailableToDto) {
    return this.service.getAvailableTos(dto)
  }

  @Get('koli')
  @Authorize(Permission.READ_BARHAL)
  listKoli(@Query() dto: ListBarhalKoliDto) {
    return this.service.listKoli(dto)
  }

  @Get('koli/:id')
  @Authorize(Permission.READ_BARHAL)
  getKoliDetail(@Param('id') id: string) {
    return this.service.getKoliDetail(id)
  }

  @Post('koli')
  @Authorize(Permission.CREATE_BARHAL)
  createKoliShell(@Body() dto: CreateBarhalKoliDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createKoliShell(dto, user.id)
  }

  @Put('koli/:id/tos')
  @Authorize(Permission.CREATE_BARHAL)
  attachTos(@Param('id') id: string, @Body() dto: AttachTosDto) {
    return this.service.attachTos(id, dto)
  }

  @Patch('koli/:id/packing')
  @Authorize(Permission.CREATE_BARHAL)
  updatePacking(@Param('id') id: string, @Body() dto: UpdatePackingDto) {
    return this.service.updatePacking(id, dto)
  }

  @Patch('koli/:id/smu')
  @Authorize(Permission.CREATE_BARHAL)
  updateSmu(@Param('id') id: string, @Body() dto: UpdateSmuDto) {
    return this.service.updateSmu(id, dto)
  }

  @Patch('koli/bulk-smu')
  @Authorize(Permission.CREATE_BARHAL)
  bulkUpdateSmu(@Body() dto: BulkUpdateSmuDto) {
    return this.service.bulkUpdateSmu(dto)
  }

  @Get('dashboard')
  @Authorize(Permission.READ_BARHAL)
  getDashboard(@Query() dto: BarhalDashboardQueryDto) {
    return this.service.getDashboard(dto)
  }

  @Get('export.csv')
  @Authorize(Permission.READ_BARHAL)
  async exportCsv(
    @Query() dto: BarhalDashboardQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.service.exportCsv(dto)
    const range = dto.startDate && dto.endDate ? `${dto.startDate}_${dto.endDate}` : 'all'
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="barhal-${range}.csv"`,
    })
    return new StreamableFile(Buffer.from(csv, 'utf-8'))
  }
}
