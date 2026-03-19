import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { memoryStorage } from 'multer'
import { Shipment } from './entities/shipment.entity'
import { ShipmentUpload } from './entities/shipment-upload.entity'
import { ShipmentUploadError } from './entities/shipment-upload-error.entity'
import { ShipmentsController } from './shipments.controller'
import { ShipmentsService } from './shipments.service'
import { ImportController } from './imports/import.controller'
import { ImportService } from './imports/import.service'
import { ImportProcessor } from './imports/import.processor'
import { AuditModule } from '../audit/audit.module'
import { SHIPMENT_IMPORT_QUEUE } from './shipments.constants'

export { SHIPMENT_IMPORT_QUEUE }

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, ShipmentUpload, ShipmentUploadError]),
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
  controllers: [ShipmentsController, ImportController],
  providers: [ShipmentsService, ImportService, ImportProcessor],
  exports: [ShipmentsService, ImportService],
})
export class ShipmentsModule {}
