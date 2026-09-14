import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetMasterDataService } from './fleet-master-data.service'
import { CreateFleetMasterDataDto } from './dto/create-fleet-master-data.dto'
import { UpdateFleetMasterDataDto } from './dto/update-fleet-master-data.dto'
import { QueryFleetMasterDataDto } from './dto/query-fleet-master-data.dto'

@ApiTags('Fleet Master Data')
@Controller('fleet/master-data')
@UseGuards(JwtAuthGuard)
export class FleetMasterDataController {
  constructor(private readonly service: FleetMasterDataService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_MASTER_DATA)
  findAll(@Query() query: QueryFleetMasterDataDto) {
    return this.service.findAll(query.category, query.includeInactive)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_MASTER_DATA)
  create(@Body() dto: CreateFleetMasterDataDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_MASTER_DATA)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetMasterDataDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_MASTER_DATA)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
