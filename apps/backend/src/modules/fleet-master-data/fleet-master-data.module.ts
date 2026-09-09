import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'
import { FleetMasterDataService } from './fleet-master-data.service'
import { FleetMasterDataController } from './fleet-master-data.controller'

@Module({
  imports: [TypeOrmModule.forFeature([FleetMasterDataEntity])],
  providers: [FleetMasterDataService],
  controllers: [FleetMasterDataController],
  // Exported for the vehicles module in Phase 2, which validates that a submitted
  // jenis_armada_id / kepemilikan_id / pool_id belongs to the right category.
  exports: [FleetMasterDataService],
})
export class FleetMasterDataModule {}
