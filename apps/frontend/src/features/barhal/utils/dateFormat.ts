import moment from 'moment'

/**
 * Format tanggal & datetime untuk seluruh tabel Barhal.
 *
 * Backend mengirim dua bentuk: kolom `date` sebagai 'YYYY-MM-DD' (mis. koli_date,
 * completed_date) dan kolom `timestamptz` sebagai ISO-8601 berzona (std/sta).
 * Bentuk pertama diparse tanpa konversi zona; bentuk kedua ditampilkan dalam waktu
 * lokal browser.
 */

const EMPTY = '—'

const DATE_ONLY_FORMATS = ['YYYY-MM-DD', 'DD-MMM-YYYY', 'DD/MM/YYYY']

/** 'DD-MMM-YYYY', mis. '06-Aug-2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY
  // Tanggal polos diparse sebagai waktu lokal, bukan UTC, agar tidak bergeser satu hari.
  const dateOnly = moment(value, DATE_ONLY_FORMATS, true)
  if (dateOnly.isValid()) return dateOnly.format('DD-MMM-YYYY')
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY') : EMPTY
}

/** 'DD-MMM-YYYY HH:mm' dalam waktu lokal browser, mis. '06-Aug-2026 14:05'. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : EMPTY
}

/** Nilai untuk input `type="datetime-local"` ('YYYY-MM-DDTHH:mm'), waktu lokal browser. */
export function toDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm') : ''
}
