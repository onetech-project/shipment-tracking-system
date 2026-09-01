# Postgres tuning runbook — prod memory at 800 MB

Written 2026-09-01 after investigating high Postgres memory in production.
The code fixes that this runbook complements are already merged; the steps here
are the operational half and must be run by hand against prod.

## What was actually wrong

800 MB of RSS was a *symptom*. `shared_buffers` is only 128 MB, so the rest was
per-connection working memory and maintenance work driven by an enormous, and
entirely unnecessary, write volume.

Evidence gathered from the running database:

| Metric | Value | Reading |
| --- | --- | --- |
| `n_tup_upd` on `air_shipments_compileaircgk` | 91,955,467 | vs 66,206 inserts — ~1,389 rewrites per row |
| `temp_bytes` | 224 GB across 33,085 files (avg 7 MB) | every sort spilled to disk |
| cache hit ratio | 78.8% | healthy is >99% |
| `seq_tup_read` on `v_pnl_to` | 596M over 9,072 scans | repeated full matview scans |
| heap size per row | 4,266 B/row (277 MB for 68K rows) | ~10x bloat |

Root cause: the sync loop's no-change detection never fired. Most Google Sheet
headers are not top-level columns — they are stored inside `extra_fields` — but
the diff compared them against `existing[key]`, which was always `undefined`. So
every row looked changed on every 15-second tick. Confirmation: all 66,203 rows
shared a single `last_synced_at` timestamp, and all 66,203 had
`last_synced_at > updated_at`.

Because `totalUpserted` was therefore always > 0, `REFRESH MATERIALIZED VIEW
CONCURRENTLY v_pnl_to` also ran every 15 seconds, and each refresh consumes up to
`maintenance_work_mem` (64 MB).

## Already fixed in code

- `processSingleSheet` resolves each sheet key against `extra_fields` before
  falling back — no-change rows are now genuinely skipped, which also stops the
  per-tick matview refresh.
- The existing-row fetch selects only the columns the diff reads instead of
  `SELECT *` over a 32-column table.
- `resolveDateExpr` probes the table shape with `LIMIT 1` instead of an `EXISTS`
  that scanned all 66K rows (~9 ms, 39 buffers) to return a boolean.
- `UsersService.create` wraps the user + profile writes in one transaction.
- Migration `20260901000001-drop-unused-write-amplifying-indexes` drops 12 unused
  indexes, including 9 GIN indexes on `extra_fields` (51 MB total, zero reads).

## Step 1 — deploy the code first

Run the migration and deploy before touching anything below. The write volume has
to drop before the bloat cleanup is worth doing, otherwise the table simply
re-bloats.

```bash
pnpm --filter backend migration:run
```

Then confirm the fix is live. After a few sync cycles, `last_synced_at` should be
spread across timestamps rather than sharing one:

```sql
SELECT date_trunc('minute', last_synced_at) AS m, count(*)
FROM air_shipments_compileaircgk
GROUP BY 1 ORDER BY 1 DESC LIMIT 10;
```

Watch the update counter stop climbing:

```sql
SELECT relname, n_tup_upd FROM pg_stat_user_tables
WHERE relname = 'air_shipments_compileaircgk';
```

Take two readings ~5 minutes apart. Before the fix this grew by roughly 4,000
rows/second; afterwards it should be near-flat when sheets are unchanged.

## Step 2 — reclaim the bloat (needs a maintenance window)

`VACUUM FULL` takes an ACCESS EXCLUSIVE lock — the table is unreadable for the
duration. At 277 MB it should take well under a minute, but schedule it.

```sql
VACUUM FULL VERBOSE air_shipments_compileaircgk;
VACUUM FULL VERBOSE air_shipments_compileseanonjava;
ANALYZE air_shipments_compileaircgk;
ANALYZE air_shipments_compileseanonjava;
```

If a lock-free rebuild is preferred, `pg_repack` does the same job online.

Expected: `air_shipments_compileaircgk` drops from ~277 MB toward ~30 MB of heap.

Do **not** `VACUUM FULL` the matview — refresh it instead:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to;
```

## Step 3 — memory settings

Current values, and what they should be. These are for the prod container; adjust
to its actual RAM (the rule of thumb assumes ~2 GB dedicated to Postgres).

| Setting | Current | Suggested | Why |
| --- | --- | --- | --- |
| `shared_buffers` | 128 MB | 512 MB | ~25% of RAM; 78.8% cache hit ratio says the working set does not fit |
| `work_mem` | 4 MB | 16 MB | avg temp file was 7 MB, so nearly every sort spilled |
| `maintenance_work_mem` | 64 MB | 256 MB | speeds up VACUUM, index builds, matview refresh |
| `effective_cache_size` | 4 GB | leave | planner hint only, no allocation |

`work_mem` is per sort node per connection, not per connection — a query with
several sorts can use a multiple of it. 16 MB against `max_connections = 100` is
a safe worst case here because the app pool is far smaller than 100.

Apply via `postgresql.conf` or the container's command flags:

```
shared_buffers = 512MB
work_mem = 16MB
maintenance_work_mem = 256MB
```

`shared_buffers` requires a restart; `work_mem` and `maintenance_work_mem` take
effect with `SELECT pg_reload_conf()`.

## Step 4 — install pg_stat_statements

The investigation had to infer query cost from table-level counters because
`pg_stat_statements` is not installed. Add it so the next one does not have to:

```
shared_preload_libraries = 'pg_stat_statements'
```

```sql
CREATE EXTENSION pg_stat_statements;
```

## Verifying it worked

Reset the counters after Step 2, let it run a day, then re-check:

```sql
SELECT pg_stat_reset();
```

```sql
-- want: cache_hit_pct > 99, temp_files near zero
SELECT round(blks_hit * 100.0 / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_pct,
       temp_files,
       pg_size_pretty(temp_bytes) AS temp
FROM pg_stat_database WHERE datname = current_database();

-- want: n_tup_upd in the same order of magnitude as n_tup_ins
SELECT relname, n_tup_ins, n_tup_upd, n_dead_tup
FROM pg_stat_user_tables ORDER BY n_tup_upd DESC LIMIT 5;

-- want: bytes_per_row back to a few hundred
SELECT n_live_tup,
       pg_relation_size('air_shipments_compileaircgk') / NULLIF(n_live_tup, 0) AS bytes_per_row
FROM pg_stat_user_tables WHERE relname = 'air_shipments_compileaircgk';
```

## Notes for later

- `air_shipments_compileaircgk` still holds every row ever synced. If the sheet
  only ever exposes a recent window, the existing-row fetch could be narrowed
  further with a `WHERE` on the sync window rather than loading the whole table.
- `idx_v_pnl_to_id` shows zero scans but must never be dropped — `REFRESH
  MATERIALIZED VIEW CONCURRENTLY` requires a unique index on the matview.
