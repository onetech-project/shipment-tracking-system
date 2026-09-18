import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetContractsService } from './fleet-contracts.service'

@ApiTags('Fleet Contracts')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetContractsController {
  constructor(private readonly service: FleetContractsService) {}

  @Get('vehicles/:id/contracts')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(id)
  }

  // POST rather than DELETE: closing a contract records that an obligation ended, it does not
  // remove the contract.
  @Post('contracts/:id/close')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(id)
  }
}
