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
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { RouteGroupsService } from './route-groups.service'
import { CreateRouteGroupDto } from './dto/create-route-group.dto'
import { UpdateRouteGroupDto } from './dto/update-route-group.dto'

@ApiTags('Route Groups')
@Controller('route-groups')
@UseGuards(JwtAuthGuard)
export class RouteGroupsController {
  constructor(private readonly service: RouteGroupsService) {}

  @Get()
  @Authorize(Permission.READ_ROUTE_GROUP)
  findAll() {
    return this.service.findAll()
  }

  // Declared before ':id' would be, and is a distinct literal path, so no route shadowing.
  @Get('available-routes')
  @Authorize(Permission.READ_ROUTE_GROUP)
  getAvailableRoutes() {
    return this.service.getAvailableRoutes()
  }

  @Post()
  @Authorize(Permission.CREATE_ROUTE_GROUP)
  create(@Body() dto: CreateRouteGroupDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_ROUTE_GROUP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteGroupDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_ROUTE_GROUP)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
