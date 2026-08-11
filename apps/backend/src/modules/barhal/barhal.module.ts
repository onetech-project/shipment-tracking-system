import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'
import { BarhalService } from './barhal.service'
import { BarhalController } from './barhal.controller'

@Module({
  imports: [TypeOrmModule.forFeature([BarhalKoli, BarhalKoliTo])],
  providers: [BarhalService],
  controllers: [BarhalController],
  exports: [BarhalService],
})
export class BarhalModule {}
