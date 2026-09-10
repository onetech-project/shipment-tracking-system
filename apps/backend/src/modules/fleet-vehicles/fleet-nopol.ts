// Normalised on write so the partial unique index actually catches duplicates. Without this
// "b  9114 kyz" and "B 9114 KYZ" are two distinct rows and the register grows a second copy of
// a truck it already has. \s covers tabs and newlines, which arrive via spreadsheet paste.
export function normalizeNopol(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}
