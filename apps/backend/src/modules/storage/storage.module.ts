import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

// Global: both the vehicle-files module and the driver SIM module need it, and neither owns it.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
