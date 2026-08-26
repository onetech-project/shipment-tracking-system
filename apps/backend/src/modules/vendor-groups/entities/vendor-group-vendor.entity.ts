import { Entity, PrimaryColumn } from 'typeorm'

// Composite primary key across both columns: a vendor may sit in many groups and a group holds many
// vendors, but the same vendor twice in one group is meaningless.
//
// length 200 mirrors the column, and the value is stored exactly as received — the aggregation in
// the vendor-comparison tab joins this string to v_pnl_to.vendor with plain equality.
@Entity('vendor_group_vendors')
export class VendorGroupVendorEntity {
  @PrimaryColumn({ name: 'vendor_group_id', type: 'uuid' })
  vendorGroupId: string

  @PrimaryColumn({ name: 'vendor', length: 200 })
  vendor: string
}
