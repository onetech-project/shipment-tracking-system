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
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { CreateScenarioDto, UpdateScenarioDto } from './dto/save-scenario.dto'

@ApiTags('Route Simulation')
@Controller('route-simulation')
@UseGuards(JwtAuthGuard)
export class RouteSimulationController {
  constructor(
    private readonly source: RouteSimulationSourceService,
    private readonly scenarios: RouteSimulationScenariosService,
  ) {}

  @Get('source')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  getSource(@Query('basis') basis?: string) {
    return this.source.getSource(basis)
  }

  @Get('scenarios')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  findAll() {
    return this.scenarios.findAll()
  }

  @Get('scenarios/:id')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.scenarios.findOne(id)
  }

  @Post('scenarios')
  @Authorize(Permission.CREATE_ROUTE_SIMULATION)
  create(@Body() dto: CreateScenarioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.scenarios.create(dto, user.id)
  }

  @Patch('scenarios/:id')
  @Authorize(Permission.UPDATE_ROUTE_SIMULATION)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScenarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scenarios.update(id, dto, user.id)
  }

  @Delete('scenarios/:id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_ROUTE_SIMULATION)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.scenarios.remove(id)
  }
}
