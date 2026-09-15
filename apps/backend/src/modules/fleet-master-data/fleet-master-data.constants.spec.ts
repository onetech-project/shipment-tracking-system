import { FLEET_MASTER_CATEGORIES } from './fleet-master-data.constants'

// The eight categories are stated three times: this constant, the CHECK constraint in
// 20260909000001-fleet-master-data.ts, and the frontend's own copy in features/fleet/types.ts.
// Only the frontend copy is protected, and only by tsc. Adding a ninth here leaves jest and tsc
// green while @IsIn accepts the value, the insert hits the CHECK, and the admin gets a 500 at
// runtime — a failure no compiler and no other test can reach. The migration's header comment
// tells the reader both sides must move together and names this file as the thing that catches
// a half-move; that instruction is only worth writing because this test makes it enforceable.
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
