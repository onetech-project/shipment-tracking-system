import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GeneralParam } from './entities/general-param.entity'
import { GeneralParamsService } from './general-params.service'
import { GeneralParamsController } from './general-params.controller'

@Module({
  imports: [TypeOrmModule.forFeature([GeneralParam])],
  providers: [GeneralParamsService],
  controllers: [GeneralParamsController],
  exports: [GeneralParamsService],
})
export class GeneralParamsModule {}
