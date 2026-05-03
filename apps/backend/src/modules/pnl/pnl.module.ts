import { Module } from '@nestjs/common'
import { PnlService } from './pnl.service'
import { PnlController } from './pnl.controller'

@Module({
  controllers: [PnlController],
  providers: [PnlService],
})
export class PnlModule {}
