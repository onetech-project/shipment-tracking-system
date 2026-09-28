import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { FleetVehicleFileEntity } from './entities/fleet-vehicle-file.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetDriverEntity } from '../fleet-drivers/entities/fleet-driver.entity'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehiclesController } from './fleet-vehicles.controller'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'
import { FleetVehicleFilesController } from './fleet-vehicle-files.controller'
import { FleetSummaryService } from './fleet-summary.service'
import { FleetContractsService } from './fleet-contracts.service'
import { FleetContractsController } from './fleet-contracts.controller'
import { FleetReportsController } from './fleet-reports.controller'
import { FleetAlertsService } from './fleet-alerts.service'
import { FleetAlertsController } from './fleet-alerts.controller'

@Module({
  // FleetMasterDataEntity is registered here so the service can check that a submitted id really
  // belongs to the category its column expects, the same way FleetDriversModule does for
  // jenis_sim. FleetDriverEntity is registered because FleetAlertsService queries the driver
  // repository directly for licence expiry.
  imports: [
    TypeOrmModule.forFeature([
      FleetVehicleEntity,
      FleetVehicleDocumentEntity,
      FleetLeaseContractEntity,
      FleetVehicleFileEntity,
      FleetMasterDataEntity,
      FleetDriverEntity,
    ]),
  ],
  providers: [
    FleetVehiclesService,
    FleetVehicleFilesService,
    FleetSummaryService,
    FleetContractsService,
    FleetAlertsService,
  ],
  controllers: [
    FleetVehiclesController,
    FleetVehicleFilesController,
    FleetContractsController,
    FleetReportsController,
    FleetAlertsController,
  ],
  exports: [FleetVehiclesService],
})
export class FleetVehiclesModule {}
