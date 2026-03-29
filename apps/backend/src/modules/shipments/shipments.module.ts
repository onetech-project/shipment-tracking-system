import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { memoryStorage } from 'multer'
import { Shipment } from './entities/shipment.entity'
import { ShipmentUpload } from './entities/shipment-upload.entity'
import { ShipmentUploadError } from './entities/shipment-upload-error.entity'
import { LinehaulTrip } from './entities/linehaul-trip.entity'
import { LinehaulTripItem } from './entities/linehaul-trip-item.entity'
import { ShipmentsController } from './shipments.controller'
import { LinehaulController } from './linehaul.controller'
import { ShipmentsService } from './shipments.service'
import { ImportController } from './imports/import.controller'
import { ImportService } from './imports/import.service'
import { ImportProcessor } from './imports/import.processor'
import { LinehaulParserService } from './imports/linehaul/linehaul-parser.service'
import { LinehaulImportService } from './imports/linehaul/linehaul-import.service'
import { AuditModule } from '../audit/audit.module'
import { SHIPMENT_IMPORT_QUEUE } from './shipments.constants'

export { SHIPMENT_IMPORT_QUEUE }

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, ShipmentUpload, ShipmentUploadError, LinehaulTrip, LinehaulTripItem]),
    BullModule.registerQueue({ name: SHIPMENT_IMPORT_QUEUE }),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get<number>('SHIPMENT_IMPORT_MAX_FILE_MB', 10) * 1024 * 1024,
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [ShipmentsController, ImportController, LinehaulController],
  providers: [ShipmentsService, ImportService, ImportProcessor, LinehaulParserService, LinehaulImportService],
  exports: [ShipmentsService, ImportService, LinehaulImportService],
})
export class ShipmentsModule {}
