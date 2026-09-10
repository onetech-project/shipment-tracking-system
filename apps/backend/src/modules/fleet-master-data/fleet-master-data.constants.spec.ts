import { FLEET_MASTER_CATEGORIES } from './fleet-master-data.constants'

// The eight categories are stated three times: this constant, the CHECK constraint in
// 20260909000001-fleet-master-data.ts, and the frontend's own copy in features/fleet/types.ts.
// Only the frontend copy is protected, and only by tsc. Adding a ninth here leaves jest and tsc
// green while @IsIn accepts it, the insert hits the CHECK, and the admin gets a 500 — and the
// migration's header comment actively invites that edit by claiming a ninth dropdown needs no
// migration. This test is the tripwire: changing the list without changing the constraint fails
// here first.
describe('FLEET_MASTER_CATEGORIES', () => {
  it('matches ck_fleet_master_data_category exactly', () => {
    expect([...FLEET_MASTER_CATEGORIES]).toEqual([
      'jenis_armada',
      'kepemilikan',
      'leasing',
      'status_kendaraan',
      'pool',
      'jenis_dokumen',
      'jenis_berkas',
      'jenis_sim',
    ])
  })
})
