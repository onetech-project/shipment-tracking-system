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

// The tab labels operators see. Indonesian because this is user-facing copy; everything else in
// the codebase stays English.
export const FLEET_CATEGORY_LABELS: Record<FleetMasterCategory, string> = {
  jenis_armada: 'Jenis Armada',
  kepemilikan: 'Kepemilikan',
  leasing: 'Leasing',
  status_kendaraan: 'Status Kendaraan',
  pool: 'Pool',
  jenis_dokumen: 'Jenis Dokumen',
  jenis_berkas: 'Jenis Berkas',
  jenis_sim: 'Jenis SIM',
}

// Only these two carry an expiry threshold, so the form shows warnDays for them alone.
export const CATEGORIES_WITH_WARN_DAYS: readonly FleetMasterCategory[] = [
  'jenis_dokumen',
  'jenis_sim',
]

export interface FleetMasterRow {
  id: string
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder: number
  isActive: boolean
  warnDays: number | null
  defaultValidMonths: number | null
  isRequired: boolean | null
}

export interface FleetMasterPayload {
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder?: number
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

export type FleetMasterUpdatePayload = Partial<Omit<FleetMasterPayload, 'category' | 'code'>> & {
  isActive?: boolean
}

export interface FleetDriver {
  id: string
  nama: string
  telepon: string | null
  simNomor: string | null
  simJenisId: string | null
  simJenis?: { id: string; label: string } | null
  simExpiresAt: string | null
  isActive: boolean
}

export interface FleetDriverPayload {
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simExpiresAt?: string | null
  isActive?: boolean
}
