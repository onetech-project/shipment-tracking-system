import { Module } from '@nestjs/common'
import { PnlSettlementService } from './pnl-settlement.service'
import { PnlSettlementController } from './pnl-settlement.controller'

@Module({
  controllers: [PnlSettlementController],
  providers: [PnlSettlementService],
})
export class PnlSettlementModule {}
