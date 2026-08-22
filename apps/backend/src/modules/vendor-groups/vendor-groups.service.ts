import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'

export interface AvailableVendor {
  vendor: string // raw name, byte-identical to what v_pnl_to.vendor holds
  hasData: boolean // appears in v_pnl_to; false means a group holding it renders an empty column
  inMaster: boolean // appears in air_shipments_smu; false = booked with no rate-card row at all
}

export interface VendorGroup {
  id: string
  name: string
  description: string | null
  vendors: string[]
}

@Injectable()
export class VendorGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VendorGroupEntity)
    private readonly groupRepo: Repository<VendorGroupEntity>,
  ) {}

  // A genuine union of the rate-card master and the values TOs actually carry, not a LEFT JOIN
  // from the master the way getAvailableRoutes does it. Route Group can be master-only because its
  // containment was measured and holds; the vendor equivalent is recorded in the spec's Kelayakan
  // section. Nothing proves a booked vendor is missing from the master today — smu_rate_missing
  // does not, since it fires on a miss over the whole (vendor, airlines, origin, destination) key
  // rather than on the vendor alone — but the master is a Google-Sheet snapshot rewritten on every
  // sync, so that measurement is a fact about today's sheet, not about the schema. The moment a
  // sync drops a vendor that TOs already reference, a master-only list makes it unselectable — and
  // the group that names it silently empties. The union costs nothing and removes that dependency.
  //
  // Names are taken raw. The only exclusions are NULL and '', written as an explicit comparison
  // rather than NULLIF(BTRIM(...)): trimming here would store a value that no longer equals
  // v_pnl_to.vendor, and the comparison join would silently miss every row.
  async getAvailableVendors(): Promise<AvailableVendor[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT vendor FROM air_shipments_smu
        WHERE vendor IS NOT NULL AND vendor <> ''
      ),
      used AS (
        SELECT DISTINCT vendor FROM v_pnl_to
        WHERE vendor IS NOT NULL AND vendor <> ''
      )
      SELECT v.vendor,
             (v.vendor IN (SELECT vendor FROM used))   AS has_data,
             (v.vendor IN (SELECT vendor FROM master)) AS in_master
      FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
      ORDER BY v.vendor
    `)

    return (rows as { vendor: string; has_data: boolean; in_master: boolean }[]).map((r) => ({
      vendor: r.vendor,
      hasData: r.has_data,
      inMaster: r.in_master,
    }))
  }
}
