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

export const FLEET_SEVERITIES = ['crit', 'warn', 'ok', 'none'] as const
export type FleetSeverity = (typeof FLEET_SEVERITIES)[number]

export const FLEET_VEHICLE_SORTS = ['nopol', '-nopol', 'severity', 'tahun', '-tahun'] as const
export type FleetVehicleSort = (typeof FLEET_VEHICLE_SORTS)[number]

// daysLeft and severity arrive computed. The frontend never derives them: the browser clock is
// the user's, and two operators in different timezones must not see different badges on the
// same row.
export interface FleetVehicleDocument {
  docTypeId: string
  code: string
  label: string
  nomor: string | null
  issuedAt: string | null
  expiresAt: string | null
  daysLeft: number | null
  severity: FleetSeverity
}

export interface FleetVehicleDriver {
  id: string
  nama: string
  simExpiresAt: string | null
  simDaysLeft: number | null
  simSeverity: FleetSeverity
}

export interface FleetVehicleRef {
  id: string
  label: string
}

// Every figure here arrives computed, for the same reason daysLeft does: the browser clock
// belongs to the user, and two operators must not disagree about how much is left to pay.
export interface FleetVehicleLease {
  id: string
  leasing: FleetVehicleRef | null
  nomorKontrak: string | null
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  // What the operator typed, or null when they left it blank. The form prefills its input from
  // this, never from angsuranTerbayar: prefilling from the computed figure would freeze a count
  // that is supposed to keep rising on its own.
  angsuranTerbayarOverride: number | null
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}

export interface FleetLeasePayload {
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: number
  tenorBulan: number
  angsuranMulai: string
  // The one optional field (requirement §2): blank means the backend derives it from the start
  // date.
  angsuranTerbayar?: number | null
}

export interface FleetVehicle {
  id: string
  nopol: string
  merk: string | null
  tipe: string | null
  tahun: number | null
  kapasitas: string | null
  noRangka: string | null
  noMesin: string | null
  noBpkb: string | null
  pemilikUnit: string | null
  odometer: number | null
  catatan: string | null
  jenisArmada: FleetVehicleRef | null
  kepemilikan: FleetVehicleRef | null
  pool: FleetVehicleRef | null
  status: FleetVehicleRef | null
  driver: FleetVehicleDriver | null
  lease: FleetVehicleLease | null
  documents: FleetVehicleDocument[]
  worstSeverity: FleetSeverity
  minDaysLeft: number | null
  isActive: boolean
}

export interface FleetVehicleListResponse {
  rows: FleetVehicle[]
  total: number
  page: number
  pageSize: number
}

export interface FleetVehicleFilters {
  q?: string
  page?: number
  pageSize?: number
  sort?: FleetVehicleSort
  severity?: FleetSeverity
  kepemilikanId?: string
  poolId?: string
  statusId?: string
  includeArchived?: boolean
}

export interface FleetVehiclePayload {
  nopol: string
  merk?: string | null
  tipe?: string | null
  tahun?: number | null
  kapasitas?: string | null
  noRangka?: string | null
  noMesin?: string | null
  noBpkb?: string | null
  pemilikUnit?: string | null
  odometer?: number | null
  catatan?: string | null
  jenisArmadaId?: string | null
  kepemilikanId?: string | null
  poolId?: string | null
  statusId?: string | null
  driverId?: string | null
  // Sent alongside the vehicle so the backend writes all three in one transaction. An explicit
  // null on lease means "this unit is no longer financed"; absent means "leave it alone".
  lease?: FleetLeasePayload | null
  documents?: FleetVehicleDocumentPayload[]
}

export interface FleetVehicleDocumentPayload {
  docTypeId: string
  nomor?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}
