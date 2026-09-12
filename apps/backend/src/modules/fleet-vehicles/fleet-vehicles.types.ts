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

// Every figure here is settled by the backend (spec §5.2). cicilanPerBulan is a number, not the
// string TypeORM hands back from a numeric column, so the frontend never has to decide how to
// parse money.
export interface FleetVehicleLeaseView {
  id: string
  leasing: FleetMasterRef | null
  nomorKontrak: string | null
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  // What the operator typed, or null when they left it blank — reported next to the figure the
  // backend worked out, because the edit form must be able to tell the two apart. Prefilling the
  // input from angsuranTerbayar would turn a derived count into a fixed one on the next save,
  // and the unit would stop counting up.
  angsuranTerbayarOverride: number | null
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}

// berkasCount is deliberately absent until Phase 3, when object storage exists. The frontend wire
// type marks it optional, so switching it on later adds a field rather than breaking the contract.
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
  lease: FleetVehicleLeaseView | null
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
