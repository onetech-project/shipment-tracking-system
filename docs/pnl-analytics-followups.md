# P&L Analytics tab — outstanding follow-ups

Recorded when `feature/pnl-analytics-tab` merged to `main` (2026-09-06). The feature is
complete and every gate is green; everything below is test-coverage quality, not missing
functionality. None of it blocks the tab from working.

Each survivor below was verified by hand in the main checkout: the mutation was applied,
`git diff --numstat` confirmed `1 1`, and the full suite was run and judged by EXIT CODE.
"SURVIVES" means the suite stayed green with the bug in place.

## 1. Eight components ship with no spec

The plan specified specs for only some of the components it created. These have none:

`AnalyticsAirline`, `AnalyticsAppendix`, `AnalyticsRa`, `AnalyticsScopePicker`,
`AnalyticsSection`, `AnalyticsSg`, `AnalyticsTrend`, `AnalyticsWeightGap`

Six confirmed surviving mutations live in them. In rough order of blast radius:

- **`AnalyticsWeightGap.tsx:26`** — `s + r.impact` -> `s - r.impact` SURVIVES. This inverts
  the sign of the headline net-effect figure. The prose beside it reads "a positive figure
  means gross weight exceeds chargeable weight — tonnage carried but not billed", so the flip
  turns an unbilled-tonnage warning into a false reassurance, in the one sentence a reader is
  most likely to act on. Worst of the six.
- **`AnalyticsTrend.tsx:60`** — dropping `* 100` from `marginPct` SURVIVES. Every bar then
  falls into the `< 10` amber band and the right-hand axis reads 0.4 instead of 40.
- **`AnalyticsTrend.tsx:104`** — dropping the `incomplete` flag from `colorForMargin` SURVIVES.
  Repaints every incomplete-cost day from grey to a colour derived from a margin the component
  itself just nulled out — claiming a number it declined to plot.
- **`AnalyticsWeightGap.tsx:56`** — the Gross wt column renders `r.chwt` SURVIVES. Every route
  shows a zero difference against a duplicated number.
- **`AnalyticsRa.tsx:29`** — `shareTable(data, 'name')` -> `shareTable([], 'name')` SURVIVES.
  The RA section reads "No RA providers in this period" forever.
- **`AnalyticsAirline.tsx:21`** — `airlineShare(data)` -> `vendorExecution(data)` SURVIVES. The
  "SMU & Airline" section lists vendors under an Airline header.

Fix: add specs for these eight. `AnalyticsTrend` and `AnalyticsWeightGap` are the two that
carry wrong numbers rather than wrong labels, so start there.

## 2. The recharts ResizeObserver stub needs to be repo-level, and sized

jsdom has no `ResizeObserver`; recharts' `ResponsiveContainer` constructs one on mount. There
is no jest setup file, so four specs each carry their own copy of a stub.

**Three of those copies are no-ops, and a no-op stub makes the chart untestable.** A container
never told a size renders *nothing*, so a chart with four broken `dataKey`s is byte-identical
in the DOM to a correct one and no assertion can separate them. Verified with a throwaway
probe spec: no-op stub -> **0 `<svg>`**; sized stub -> **1 `<svg>`**.

- Sized (correct): `AnalyticsCostStructure.spec.tsx` — reports a fixed 640x280 box back to the
  observer, and advances fake timers past recharts' entry animation before reading geometry.
  This, not its assertions, is what made the `dataKey` mutation killable.
- No-op (blind): `AnalyticsVendor.spec.tsx`, `ShareBlock.spec.tsx`,
  `AnalyticsTimePatterns.spec.tsx`.

Fix: add a jest setup file carrying the **sized** stub and drop the four local copies.
Retrofitting the three blind specs will likely expose further survivors in their charts —
expect that, it is the point.

## 3. `VIEW_SUBTITLE` is unasserted for the five original P&L tabs

Pre-existing, not introduced by this branch. `VIEW_SUBTITLE` is `Record<PnlView, string>`, so
a *missing* entry fails `tsc` but a *wrong* entry is invisible to both tsc and the suite —
replacing a subtitle with `'MUTATED'` leaves everything green. Task 21 added an assertion for
the `analytics` subtitle only; `estimate`, `actual`, `daily`, `routes` and `vendors` remain
unasserted.

## 4. Dead guard in `utils/series.ts:170`

`dailyOutliers` filters `rows` to `weight > 0` before computing the median, so the median can
never be 0 and `if (!median) return []` is unreachable. Left in place deliberately: removing it
is a behaviour change and belongs to a human, not to a cleanup pass.

## 5. Minor, carried from Task 1 (backend)

`pnl.service.spec.ts:877` — the FILTER-count test runs the bare alias form only, so dropping
`v.` from `cost_to` *inside* a FILTER survives the suite. Harmless today (no joined table has a
`cost_to` column), a hazard if one ever does. Fix: loop the test over both alias forms, the way
its sibling test already does.
