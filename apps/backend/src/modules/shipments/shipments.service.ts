import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Shipment } from './entities/shipment.entity';
import type { ShipmentResponse } from '@shared/shipments';

@Injectable()
export class ShipmentsService {
  private readonly idRegex: RegExp;

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    private readonly config: ConfigService,
  ) {
    const pattern = this.config.get<string>('SHIPMENT_ID_REGEX', '^[A-Z0-9-]{6,40}$');
    this.idRegex = new RegExp(pattern);
  }

  async findByShipmentId(organizationId: string, shipmentId: string): Promise<ShipmentResponse> {
    if (!shipmentId || !this.idRegex.test(shipmentId)) {
      throw new BadRequestException({ code: 'INVALID_SHIPMENT_ID_FORMAT', message: 'Invalid shipment ID format' });
    }

    const shipment = await this.shipmentRepo.findOne({
      where: { organizationId, shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    }

    return {
      id: shipment.id,
      shipmentId: shipment.shipmentId,
      origin: shipment.origin,
      destination: shipment.destination,
      status: shipment.status as any,
      carrier: shipment.carrier,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate
        ? shipment.estimatedDeliveryDate.toISOString().split('T')[0]
        : null,
      contentsDescription: shipment.contentsDescription,
    };
  }
}
