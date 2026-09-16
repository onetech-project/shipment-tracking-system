import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'
import { UploadIntentDto } from './dto/upload-intent.dto'
import { ConfirmUploadDto } from './dto/confirm-upload.dto'
import { ExternalUrlDto } from './dto/external-url.dto'

// Files ride the vehicle's permissions (spec §7): whoever may edit a unit may attach its papers.
@ApiTags('Fleet Vehicle Files')
@Controller('fleet/vehicles/:id/files')
@UseGuards(JwtAuthGuard)
export class FleetVehicleFilesController {
  constructor(private readonly service: FleetVehicleFilesService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(id)
  }

  @Post(':slotId/upload-intent')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  createIntent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: UploadIntentDto,
  ) {
    return this.service.createIntent(id, slotId, dto)
  }

  @Post(':slotId/confirm')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.confirm(id, slotId, dto, user?.id ?? null)
  }

  @Post(':slotId/external-url')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  setExternalUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: ExternalUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setExternalUrl(id, slotId, dto, user?.id ?? null)
  }

  @Get(':fileId/download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.service.downloadUrl(id, fileId)
  }

  @Delete(':fileId')
  @HttpCode(204)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.service.remove(id, fileId)
  }
}
