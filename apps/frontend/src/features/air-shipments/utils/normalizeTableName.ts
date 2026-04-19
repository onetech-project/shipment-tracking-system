export function normalizeTableName(sheetName: string, prefix = 'air_shipments_'): string {
  if (typeof sheetName !== 'string' || sheetName.trim().length === 0) {
    return sheetName
  }

  // Remove diacritics, lowercase
  let s = sheetName.normalize('NFKD').replace(/\p{Diacritic}/gu, '')
  s = s.toLowerCase()

  // Replace non-alphanumeric with underscore, collapse underscores
  s = s.replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_')

  // Trim leading/trailing underscores
  s = s.replace(/^_+|_+$/g, '')

  // If starts with digit, prefix with 't_'
  if (/^[0-9]/.test(s)) s = `t_${s}`

  const PG_MAX_IDENTIFIER = 63
  const available = PG_MAX_IDENTIFIER - prefix.length
  if (s.length > available) s = s.slice(0, available)

  return `${prefix}${s}`
}

export const getAirShipmentsTabName = (sheetName: string): string => {
  return sheetName.match(/[A-Z]+(?=[A-Z][a-z]|$)/g)?.join(' ') || ''
}
