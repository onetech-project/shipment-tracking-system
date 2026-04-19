export function quoteIdentifier(identifier: string): string {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new TypeError('identifier must be a non-empty string')
  }

  // Escape double quotes by doubling them (Postgres rule)
  const escaped = identifier.replace(/"/g, '""')
  return `"${escaped}"`
}

export default quoteIdentifier
