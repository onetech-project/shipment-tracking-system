import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetDriverFilesService } from './fleet-driver-files.service'
import { UploadIntentDto } from '../fleet-vehicles/dto/upload-intent.dto'
import { ConfirmUploadDto } from '../fleet-vehicles/dto/confirm-upload.dto'
// The same shape as the vehicle files endpoint, imported rather than copied: a second copy is a
// second thing to keep in step with what StorageService will sign.
import { DownloadUrlQueryDto } from '../fleet-vehicles/dto/download-url-query.dto'

// Drivers ride the vehicle permissions, the same way documents and contracts do (spec §7).
@ApiTags('Fleet Driver Files')
@Controller('fleet/drivers/:id/sim-file')
@UseGuards(JwtAuthGuard)
export class FleetDriverFilesController {
  constructor(private readonly service: FleetDriverFilesService) {}

  @Post('upload-intent')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  createIntent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadIntentDto) {
    return this.service.createIntent(id, dto)
  }

  @Post('confirm')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmUploadDto) {
    return this.service.confirm(id, dto)
  }

  @Get('download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(@Param('id', ParseUUIDPipe) id: string, @Query() query: DownloadUrlQueryDto) {
    return this.service.downloadUrl(id, query.disposition)
  }

  @Delete()
  @HttpCode(204)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
