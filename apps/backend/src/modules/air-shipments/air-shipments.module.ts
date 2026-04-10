import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AirShipmentCgk } from './entities/air-shipment-cgk.entity'
import { AirShipmentSub } from './entities/air-shipment-sub.entity'
import { AirShipmentSda } from './entities/air-shipment-sda.entity'
import { RatePerStation } from './entities/rate-per-station.entity'
import { RouteMaster } from './entities/route-master.entity'
import { SheetsService } from './sheets.service'
import { AirShipmentsService } from './air-shipments.service'
import { AirShipmentsController } from './air-shipments.controller'
import { SyncNotificationGateway } from './sync-notification.gateway'
import { SchedulerService } from './scheduler.service'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
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
  providers: [SheetsService, AirShipmentsService, SyncNotificationGateway, SchedulerService],
  exports: [AirShipmentsService],
})
export class AirShipmentsModule {}
