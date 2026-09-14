import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehiclesController } from './fleet-vehicles.controller'

@Module({
  // FleetMasterDataEntity is registered here so the service can check that a submitted id really
  // belongs to the category its column expects, the same way FleetDriversModule does for
  // jenis_sim.
  imports: [
    TypeOrmModule.forFeature([
      FleetVehicleEntity,
      FleetVehicleDocumentEntity,
      FleetLeaseContractEntity,
      FleetMasterDataEntity,
    ]),
  ],
  providers: [FleetVehiclesService],
  controllers: [FleetVehiclesController],
  exports: [FleetVehiclesService],
})
export class FleetVehiclesModule {}
