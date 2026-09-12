// Normalised on write so the partial unique index actually catches duplicates. Without this
// "b 9114 kyz", "B-9114-KYZ" and "B9114KYZ" are three distinct rows and the register grows three
// copies of one truck. Requirement §1 asks for the closed-up form specifically, so every
// separator goes rather than collapsing to a single space. \s covers tabs and newlines, which
// arrive via spreadsheet paste.
export function normalizeNopol(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}
