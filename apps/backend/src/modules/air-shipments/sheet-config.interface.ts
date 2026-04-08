export interface SheetConfig {
  /** Google Sheet tab name */
  sheetName: string;
  /** Target PostgreSQL table */
  tableName: string;
  /** 1-based index of the header row */
  headerRow: number;
  /**
   * Normalized column name(s) used as the unique key.
   * Use a string for a single column (e.g. "to_number") or an array for a
   * composite key (e.g. ["origin_dc", "destination_dc"]).
   */
  uniqueKey: string | string[];
  /** If true, columns with empty/null normalized headers are dropped */
  skipNullCols: boolean;
}

export interface SheetResult {
  sheetName: string;
  tableName: string;
  uniqueKey: string | string[];
  /** Normalized header names (in column order) */
  headers: string[];
  /** Array of row objects keyed by normalized header */
  rows: Record<string, unknown>[];
}
