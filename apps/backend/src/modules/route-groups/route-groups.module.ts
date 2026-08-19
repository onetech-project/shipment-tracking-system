import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupsController } from './route-groups.controller'

@Module({
  imports: [TypeOrmModule.forFeature([RouteGroupEntity, RouteGroupRouteEntity])],
  providers: [RouteGroupsService],
  controllers: [RouteGroupsController],
  exports: [RouteGroupsService],
})
export class RouteGroupsModule {}
