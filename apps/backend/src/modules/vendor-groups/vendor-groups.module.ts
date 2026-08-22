import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'
import { VendorGroupVendorEntity } from './entities/vendor-group-vendor.entity'
import { VendorGroupsService } from './vendor-groups.service'
import { VendorGroupsController } from './vendor-groups.controller'

@Module({
  imports: [TypeOrmModule.forFeature([VendorGroupEntity, VendorGroupVendorEntity])],
  providers: [VendorGroupsService],
  controllers: [VendorGroupsController],
  // Exported so the PnL module can resolve group memberships when the Vendor Comparison tab lands.
  exports: [VendorGroupsService],
})
export class VendorGroupsModule {}
