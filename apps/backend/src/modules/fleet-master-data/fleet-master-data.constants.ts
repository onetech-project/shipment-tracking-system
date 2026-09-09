// The eight dropdowns the fleet module drives. Kept as one list so the DTO's @IsIn, the
// controller's query validation and the seed migration cannot drift apart.
export const FLEET_MASTER_CATEGORIES = [
  'jenis_armada',
  'kepemilikan',
  'leasing',
  'status_kendaraan',
  'pool',
  'jenis_dokumen',
  'jenis_berkas',
  'jenis_sim',
] as const

export type FleetMasterCategory = (typeof FLEET_MASTER_CATEGORIES)[number]

// warn_days is meaningful for the two categories that carry an expiry date; the rest leave it null.
export const CATEGORIES_WITH_WARN_DAYS: readonly FleetMasterCategory[] = [
  'jenis_dokumen',
  'jenis_sim',
]

export const DEFAULT_WARN_DAYS = 30
