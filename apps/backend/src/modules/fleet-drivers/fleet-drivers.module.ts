import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetDriversService } from './fleet-drivers.service'
import { FleetDriversController } from './fleet-drivers.controller'

@Module({
  // FleetMasterDataEntity is registered here so the service can validate that a submitted
  // simJenisId really is a jenis_sim row.
  imports: [TypeOrmModule.forFeature([FleetDriverEntity, FleetMasterDataEntity])],
  providers: [FleetDriversService],
  controllers: [FleetDriversController],
  exports: [FleetDriversService],
})
export class FleetDriversModule {}
