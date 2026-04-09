/**
 * Header normalization pipeline (FR-012–FR-015).
 *
 * normalizeHeader: Converts a raw Google Sheets column header string to a
 * stable, lowercase, underscore-delimited database column name.
 *
 * makeUniqueHeaders: Ensures all headers in an array are unique by appending
 * `_2`, `_3`, … to subsequent occurrences of the same name.
 */

/**
 * Normalize a single raw header string.
 *
 * Pipeline (FR-012):
 *  1. Replace newline characters with a space
 *  2. Remove characters that are not alphanumeric or space
 *  3. Trim leading/trailing whitespace
 *  4. Collapse one or more spaces into a single underscore
 *  5. Convert to lowercase
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\n/g, ' ')           // 1. newlines → space
    .replace(/[^a-zA-Z0-9 ]/g, '') // 2. strip non-alphanumeric non-space
    .trim()                          // 3. trim edges
    .replace(/ +/g, '_')            // 4. spaces → underscore
    .toLowerCase();                  // 5. lowercase
}

/**
 * Make all headers in the array unique by suffixing duplicates (FR-013).
 * The first occurrence keeps its name; subsequent occurrences get `_2`, `_3`, …
 */
export function makeUniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((h) => {
    const count = (counts.get(h) ?? 0) + 1;
    counts.set(h, count);
    return count === 1 ? h : `${h}_${count}`;
  });
}
