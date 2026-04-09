import { Controller, Get, Query, UseGuards, Logger, InternalServerErrorException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AirShipmentsService } from './air-shipments.service';
import { AirShipmentQueryDto } from './dto/air-shipment-query.dto';

@Controller('air-shipments')
@UseGuards(JwtAuthGuard)
export class AirShipmentsController {
  private readonly logger = new Logger(AirShipmentsController.name);

  constructor(private readonly service: AirShipmentsService) {}

  @Get('cgk')
  async findAllCgk(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllCgk(query);
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/cgk]', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException();
    }
  }

  @Get('sub')
  async findAllSub(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllSub(query);
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/sub]', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException();
    }
  }

  @Get('sda')
  async findAllSda(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllSda(query);
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/sda]', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException();
    }
  }

  @Get('rate')
  async findAllRate(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllRate(query);
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/rate]', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException();
    }
  }

  @Get('routes')
  async findAllRoutes(@Query() query: AirShipmentQueryDto) {
    try {
      return await this.service.findAllRoutes(query);
    } catch (err: unknown) {
      this.logger.error('[GET /air-shipments/routes]', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException();
    }
  }
}
