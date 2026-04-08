export interface SyncUpdatePayload {
  /** Names of target DB tables that had at least one upserted row this cycle */
  affectedTables: string[];
  /** Total number of rows upserted across all sheets in this cycle */
  totalUpserted: number;
  /** ISO 8601 UTC timestamp of when the cycle completed */
  syncedAt: string;
}
