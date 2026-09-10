import { FleetSeverity } from './fleet-vehicles.constants'

export interface FleetMasterRef {
  id: string
  label: string
}

export interface FleetVehicleDocumentView {
  docTypeId: string
  code: string
  label: string
  nomor: string | null
  issuedAt: string | null
  expiresAt: string | null
  daysLeft: number | null
  severity: FleetSeverity
}

export interface FleetVehicleDriverView {
  id: string
  nama: string
  simExpiresAt: string | null
  simDaysLeft: number | null
  simSeverity: FleetSeverity
}

// berkasCount and activeContract are deliberately absent until Phase 3, when their tables
// exist. The frontend wire type marks them optional, so switching them on later adds a field
// rather than breaking the contract.
export interface FleetVehicleView {
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
  jenisArmada: FleetMasterRef | null
  kepemilikan: FleetMasterRef | null
  pool: FleetMasterRef | null
  status: FleetMasterRef | null
  driver: FleetVehicleDriverView | null
  documents: FleetVehicleDocumentView[]
  worstSeverity: FleetSeverity
  minDaysLeft: number | null
  isActive: boolean
}

export interface FleetVehicleListResult {
  rows: FleetVehicleView[]
  total: number
  page: number
  pageSize: number
}
