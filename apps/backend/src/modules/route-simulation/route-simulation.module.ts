import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouteGroupsModule } from '../route-groups/route-groups.module'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RouteSimulationController } from './route-simulation.controller'

@Module({
  imports: [TypeOrmModule.forFeature([RouteSimulationScenarioEntity]), RouteGroupsModule],
  providers: [RouteSimulationSourceService, RouteSimulationScenariosService],
  controllers: [RouteSimulationController],
})
export class RouteSimulationModule {}
