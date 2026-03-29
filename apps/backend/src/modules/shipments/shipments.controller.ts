import { Controller, Get, Param } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService) {}

  @Get(':shipmentId')
  findOne(
    @Param('shipmentId') shipmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findByShipmentId(user.organizationId, shipmentId);
  }
}
