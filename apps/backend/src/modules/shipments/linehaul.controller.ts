import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LinehaulTrip } from './entities/linehaul-trip.entity';
import { LinehaulTripItem } from './entities/linehaul-trip-item.entity';
import {
  LinehaulLookupResponse,
  LinehaulTripsListResponse,
  LinehaulTripDetailResponse,
  LinehaulTripResponse,
  LinehaulTripItemResponse,
} from '@shared/shipments';

const TO_NUMBER_PATTERN = /^[A-Za-z0-9][\w\-]{2,49}$/;

@Injectable()
class ToNumberValidationPipe implements PipeTransform<string, string> {
  transform(value: string, _metadata: ArgumentMetadata): string {
    if (!value || !TO_NUMBER_PATTERN.test(value)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_TO_NUMBER_FORMAT',
        message: `toNumber must match pattern ${TO_NUMBER_PATTERN} (3–50 alphanumeric/dash/underscore characters)`,
      });
    }
    return value;
  }
}

@Controller('shipments/linehaul')
export class LinehaulController {
  constructor(
    @InjectRepository(LinehaulTrip)
    private readonly tripRepo: Repository<LinehaulTrip>,
    @InjectRepository(LinehaulTripItem)
    private readonly itemRepo: Repository<LinehaulTripItem>,
  ) {}

  /**
   * GET /shipments/linehaul/items/:toNumber
   * Look up a trip item by Transfer Order number (QR scan).
   */
  @Get('items/:toNumber')
  async lookupItem(
    @Param('toNumber', ToNumberValidationPipe) toNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LinehaulLookupResponse> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoinAndSelect('item.linehaulTrip', 'trip')
      .where('item.to_number = :toNumber', { toNumber })
      .andWhere('trip.organization_id = :orgId', { orgId: user.organizationId })
      .getOne();

    if (!item) {
      throw new HttpException(
        { statusCode: 404, code: 'TRIP_ITEM_NOT_FOUND', message: `No trip item found for toNumber '${toNumber}'` },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      item: this.mapItemResponse(item),
      trip: this.mapTripResponse(item.linehaulTrip),
    };
  }

  /**
   * GET /shipments/linehaul/trips
   * List trips for the authenticated user's org with cursor pagination.
   */
  @Get('trips')
  async listTrips(
    @Query('limit') limitParam?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<LinehaulTripsListResponse> {
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 100);

    const qb = this.tripRepo
      .createQueryBuilder('trip')
      .leftJoin('trip.items', 'item')
      .addSelect('COUNT(item.id)', 'itemCount')
      .where('trip.organization_id = :orgId', { orgId: user!.organizationId })
      .groupBy('trip.id')
      .orderBy('trip.created_at', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      qb.andWhere('trip.created_at < :cursor', { cursor: decoded });
    }

    const raw = await qb.getRawAndEntities();

    const items = raw.entities.slice(0, limit).map((trip, idx) => ({
      ...this.mapTripResponse(trip),
      itemCount: parseInt(raw.raw[idx]?.itemCount || '0', 10),
      createdAt: trip.createdAt.toISOString(),
    }));

    const hasMore = raw.entities.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? Buffer.from(items[items.length - 1].createdAt).toString('base64')
      : null;

    return { items, nextCursor };
  }

  /**
   * GET /shipments/linehaul/trips/:tripId
   * Get trip details with all items.
   */
  @Get('trips/:tripId')
  async getTripDetail(
    @Param('tripId') tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LinehaulTripDetailResponse> {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      relations: ['items'],
    });

    if (!trip) {
      throw new HttpException(
        { statusCode: 404, code: 'TRIP_NOT_FOUND', message: 'Trip not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (trip.organizationId !== user.organizationId) {
      throw new HttpException(
        { statusCode: 403, code: 'FORBIDDEN', message: 'Trip belongs to a different organization' },
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      trip: this.mapTripResponse(trip),
      items: (trip.items ?? []).map((item) => this.mapItemResponse(item)),
    };
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapTripResponse(trip: LinehaulTrip): LinehaulTripResponse {
    return {
      id: trip.id,
      tripCode: trip.tripCode,
      schedule: trip.schedule,
      origin: trip.origin,
      destination: trip.destination,
      vendor: trip.vendor,
      plateNumber: trip.plateNumber,
      driverName: trip.driverName,
      std: trip.std?.toISOString() ?? null,
      sta: trip.sta?.toISOString() ?? null,
      ata: trip.ata?.toISOString() ?? null,
      totalWeight: trip.totalWeight ? Number(trip.totalWeight) : null,
      createdAt: trip.createdAt?.toISOString(),
    };
  }

  private mapItemResponse(item: LinehaulTripItem): LinehaulTripItemResponse {
    return {
      id: item.id,
      toNumber: item.toNumber,
      weight: item.weight ? Number(item.weight) : null,
      destination: item.destination,
      dgType: item.dgType,
      toType: item.toType,
    };
  }
}
