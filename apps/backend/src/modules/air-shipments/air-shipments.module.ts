import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AirShipmentCgk } from './entities/air-shipment-cgk.entity'
import { AirShipmentSub } from './entities/air-shipment-sub.entity'
import { AirShipmentSda } from './entities/air-shipment-sda.entity'
import { RatePerStation } from './entities/rate-per-station.entity'
import { RouteMaster } from './entities/route-master.entity'
import { SheetsService } from './sheets.service'
import { DynamicTableService } from './dynamic-table.service'
import { AirShipmentsService } from './air-shipments.service'
import { AirShipmentsController } from './air-shipments.controller'
import { SyncNotificationGateway } from './sync-notification.gateway'
import { SchedulerService } from './scheduler.service'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'
import { GeneralParamsModule } from '../general-params/general-params.module'
import { AirlineTrackingSourceService } from './airline-tracking/airline-tracking-source.service'
import { AirlineTrackingService } from './airline-tracking/airline-tracking.service'
import { AirlineTrackingScheduler } from './airline-tracking/airline-tracking.scheduler'

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    HttpModule.register({ timeout: 15_000, maxRedirects: 5 }),
    GeneralParamsModule,
    TypeOrmModule.forFeature([
      AirShipmentCgk,
      AirShipmentSub,
      AirShipmentSda,
      RatePerStation,
      RouteMaster,
      GoogleSheetConfig,
      GoogleSheetSheetConfig,
    ]),
  ],
  controllers: [AirShipmentsController],
  providers: [
    SheetsService,
    DynamicTableService,
    AirShipmentsService,
    SyncNotificationGateway,
    SchedulerService,
    AirlineTrackingSourceService,
    AirlineTrackingService,
    AirlineTrackingScheduler,
  ],
  exports: [AirShipmentsService, DynamicTableService],
})
export class AirShipmentsModule {}
