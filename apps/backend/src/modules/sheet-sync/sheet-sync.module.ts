import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { GoogleSheetsService } from './google-sheets.service'
import { SheetSyncService } from './sheet-sync.service'
import { SyncGateway } from './sync.gateway'
import { ColumnMapperService } from './column-mapper'

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [GoogleSheetsService, SheetSyncService, SyncGateway, ColumnMapperService],
  exports: [SyncGateway],
})
export class SheetSyncModule {}
