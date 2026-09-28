import { FleetSeverity } from './fleet-vehicles.constants'
import { FleetVehicleView } from './fleet-vehicles.types'

const SEVERITY_LABEL: Record<FleetSeverity, string> = {
  crit: 'Kedaluwarsa',
  warn: 'Segera',
  ok: 'Aman',
  none: 'Belum lengkap',
}

// Header labels are Indonesian because this file is opened by operators, unlike everything else
// in the codebase.
const BASE_COLUMNS: [string, (v: FleetVehicleView) => unknown][] = [
  ['Nomor Polisi', (v) => v.nopol],
  ['Jenis Armada', (v) => v.jenisArmada?.label],
  ['Merk', (v) => v.merk],
  ['Tipe', (v) => v.tipe],
  ['Tahun', (v) => v.tahun],
  ['Kapasitas', (v) => v.kapasitas],
  ['No Rangka', (v) => v.noRangka],
  ['No Mesin', (v) => v.noMesin],
  ['No BPKB', (v) => v.noBpkb],
  ['Status Kepemilikan', (v) => v.kepemilikan?.label],
  ['Pemilik/Vendor', (v) => v.pemilikUnit],
  ['Leasing', (v) => v.lease?.leasing?.label],
  ['No Kontrak', (v) => v.lease?.nomorKontrak],
  ['Sopir', (v) => v.driver?.nama],
  ['SIM Berlaku', (v) => v.driver?.simExpiresAt],
  ['Pool', (v) => v.pool?.label],
  ['Status', (v) => v.status?.label],
  ['Odometer', (v) => v.odometer],
]

const TRAILING_COLUMNS: [string, (v: FleetVehicleView) => unknown][] = [
  ['Cicilan per Bulan', (v) => v.lease?.cicilanPerBulan],
  ['Tenor (bulan)', (v) => v.lease?.tenorBulan],
  ['Angsuran Terbayar', (v) => v.lease?.angsuranTerbayar],
  ['Sisa Angsuran', (v) => v.lease?.sisaAngsuran],
  ['Sisa Kewajiban', (v) => (v.lease && v.lease.sisaAngsuran > 0 ? v.lease.sisaKewajiban : null)],
  ['Berkas Tersimpan', (v) => `${v.berkasCount.ada}/${v.berkasCount.wajib}`],
  ['Dokumen Terdekat (hari)', (v) => v.minDaysLeft],
  ['Status Dokumen', (v) => SEVERITY_LABEL[v.worstSeverity]],
  ['Catatan', (v) => v.catatan],
]

// A field holding a comma, a quote or a newline is quoted and its quotes doubled — RFC 4180.
// Without this one comma in a note shifts every column after it by one, silently.
function escape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// The document columns are derived from the data rather than fixed, because the type list is
// master data: an admin who adds "Izin Bongkar Muat" must see it in the export without a code
// change. The prototype hardcoded twelve date columns and could not.
function documentColumns(rows: FleetVehicleView[]): { code: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    for (const doc of row.documents) {
      if (!seen.has(doc.code)) seen.set(doc.code, doc.label)
    }
  }
  return [...seen.entries()].map(([code, label]) => ({ code, label }))
}

export function toCsv(rows: FleetVehicleView[]): string {
  const docCols = documentColumns(rows)

  const header = [
    ...BASE_COLUMNS.map(([label]) => label),
    ...docCols.map((c) => `${c.label} Berlaku Sampai`),
    ...TRAILING_COLUMNS.map(([label]) => label),
  ]

  const lines = [header.map(escape).join(',')]
  for (const row of rows) {
    const byCode = new Map(row.documents.map((d) => [d.code, d]))
    const line = [
      ...BASE_COLUMNS.map(([, read]) => read(row)),
      ...docCols.map((c) => byCode.get(c.code)?.expiresAt ?? null),
      ...TRAILING_COLUMNS.map(([, read]) => read(row)),
    ]
    lines.push(line.map(escape).join(','))
  }

  // BOM + CRLF so Excel opens the file as UTF-8 on a double click instead of mangling every
  // accented name into Latin-1.
  return `﻿${lines.join('\r\n')}`
}
