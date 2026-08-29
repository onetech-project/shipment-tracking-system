'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function Sheet({ name }: { name: string }) {
  return (
    <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      {name}
    </span>
  )
}

function Col({ name }: { name: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono text-foreground/80">
      {name}
    </code>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="border-t" />
}

export function PnlFormulaPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border bg-muted/30 text-sm">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium">How is estimated P&amp;L calculated?</span>
      </button>

      {open && (
        <div className="border-t px-4 pb-5 pt-4 space-y-5 text-xs">

          {/* ── IMPORTANT CAVEAT ── */}
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium mb-0.5">Estimated figures — not actual billing</p>
            <p className="text-amber-700 dark:text-amber-300">
              The billing cycle is assigned by the <em>selected date basis</em> (default arrival,{' '}
              <Col name="ata_vendor_wh_destination" />), which reflects shipment movement — not when the
              customer was invoiced or paid.
            </p>
          </div>

          <Divider />

          {/* ── BILLING CYCLE ── */}
          <Section title="1. Billing Cycle Assignment">
            <p className="mb-2 text-muted-foreground">
              Source: <Sheet name="Compile Air CGK" />. The <strong>date basis</strong> is selectable in the
              header (defaults to <Col name="ata_vendor_wh_destination" />); the cycle and the custom range
              both filter on the chosen field.
            </p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Date basis options</td>
                  <td className="py-1.5">
                    <Col name="ata_vendor_wh_destination" /> (arrival, default) ·{' '}
                    <Col name="atd_origin" /> (departure) · <Col name="completed_time" /> (TO completed)
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Supported formats</td>
                  <td className="py-1.5 font-mono text-foreground/80">
                    <Col name="YYYY-MM-DD HH:MM" /> (ISO), <Col name="DD-Mon-YYYY HH:MM" />, and{' '}
                    <Col name="D Mon YYYY H:MM" /> (single-digit day)
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Cycle label</td>
                  <td className="py-1.5">
                    <Col name="YYYY-MM-1H" /> for days 1–15 · <Col name="YYYY-MM-2H" /> for days 16–31
                    (of the chosen basis date)
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── REVENUE ── */}
          <Section title="2. Estimated Revenue (per TO)">
            <p className="mb-2 text-muted-foreground">
              Freight rate source: <Col name="air_shipments_data" /> (the DC-pair master, matched by route
              the same way as station resolution below). Other fields from <Sheet name="Compile Air CGK" />.
            </p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Freight revenue</td>
                  <td className="py-1.5 font-mono">gross_weight × rate_spx</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">+ Packing surcharge</td>
                  <td className="py-1.5"><Col name="additional_amount_packing_kayu" /> (0 when blank)</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1.5 pr-4">= Revenue per TO</td>
                  <td className="py-1.5 font-mono">(gross_weight × rate_spx) + packing_kayu</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Discount</td>
                  <td className="py-1.5 font-mono">
                    gross_weight × (<Col name="pph_2" /> + <Col name="disc_15" />)
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-muted-foreground">
              <Col name="rate_spx" />, <Col name="pph_2" /> and <Col name="disc_15" /> come from{' '}
              <Col name="air_shipments_data" /> for the TO&apos;s route. The discount is tracked as its own
              figure, <strong>not</strong> deducted from revenue. Est. Revenue on the KPI cards is the gross
              figure above; the discount is subtracted once when gross profit is computed (section 5) — net
              revenue works out to gross_weight × (rate_spx − pph_2 − disc_15) + packing_kayu.
            </p>
          </Section>

          <Divider />

          {/* ── COST LOOKUP ── */}
          <Section title="3. Cost Lookup (per AWB)">
            <p className="mb-3 text-muted-foreground">
              The booking entry in <Sheet name="SMU Rate CGK SPX" /> maps each AWB to its vendor, airline, and rate tables.
              Cost is computed at AWB level then prorated to each TO by weight share. AWB-level costs use{' '}
              <strong>chargeable weight</strong> (<Col name="chwt_airlines" />), falling back to gross weight when
              chargeable weight is missing.
            </p>

            <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <p className="font-medium mb-0.5">
                Route fallback — cost without waiting for the reservation
              </p>
              <p className="text-sky-700 dark:text-sky-300">
                When an AWB has no booking row (or its vendor/airline pair has no{' '}
                <Sheet name="SMU" /> rate), cost is estimated from the route instead. The TO&apos;s origin
                and destination DC resolve through <Col name="air_shipments_data" /> to{' '}
                <Col name="3lc_origin" /> / <Col name="3lc_destination" />, and every cost below is
                computed on those airport codes. Such rows are marked{' '}
                <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                  Estimated
                </span>{' '}
                in the AWB table and switch to real booking figures as soon as the reservation exists.
                Estimates cost on <strong>gross weight</strong> — chargeable weight lives on the booking.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">Route resolution (feeds RA, SG Outgoing and SG Incoming)</p>
                <p className="text-muted-foreground">
                  A TO&apos;s route is <Col name="origin_station" /> × <Col name="destination_station" />, taken
                  from the DC-pair master <Col name="air_shipments_data" /> by matching the TO&apos;s origin and
                  destination DC, and falling back to <Sheet name="Compile Air CGK" />&apos;s own station columns
                  when the pair is not in the master. The master wins where both are filled.
                </p>
                <p className="text-muted-foreground">
                  Three costs depend on it: the <Sheet name="SG Incoming" /> rate is looked up by route, and both
                  RA and SG Outgoing branch on whether the origin is Surabaya. Note the grain differs — the
                  Surabaya test for RA and SG Outgoing is taken per AWB (the origin of its TOs), while the SG
                  Incoming lookup and the flag below are per TO.
                </p>
                <p className="text-muted-foreground">
                  A TO whose route resolves from neither source keeps its revenue but carries no route, so it
                  drops out of the Daily Report while still counting toward the KPI cards, and is flagged{' '}
                  <Col name="station_mapping_missing" /> in the Data Quality panel — fix it by adding the DC pair
                  to <Col name="air_shipments_data" />, not by editing a sheet.
                </p>
                <p className="text-muted-foreground">
                  <strong>SMU cost does not use this route.</strong> It matches on{' '}
                  <Sheet name="SMU Rate CGK SPX" />&apos;s own <Col name="via" /> / <Col name="dest" /> airport
                  codes, which are a separate field from the station names above.
                </p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SMU Cost</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="SMU Rate CGK SPX" /> <Col name="account" /> × <Col name="airlines" /> ×{' '}
                  <Col name="via" /> × <Col name="dest" /> → <Sheet name="SMU" /> <Col name="vendor" /> ×{' '}
                  <Col name="airlines" /> × <Col name="origin" /> × <Col name="destination" />
                </p>
                <p className="font-mono text-foreground/80">
                  ((<Col name="freight_rate" /> + <Col name="sc" /> + <Col name="fbc" /> + <Col name="myc" /> +{' '}
                  <Col name="other" />) × w + <Col name="admin_smu" />) × (1 + <Col name="ppn" />/100) − (
                  <Col name="freight_rate" /> × w) × <Col name="komisi" />/100
                </p>
                <p className="text-muted-foreground">
                  Built from the SMU rate components (matches the workbook&apos;s Origin CGK cols O–X), where{' '}
                  <span className="font-mono">w</span> = AWB chargeable weight. PPN is charged on freight + all
                  surcharges + admin; komisi (commission rebate) is deducted on the freight portion only.{' '}
                  <Col name="ppn" /> and <Col name="komisi" /> are percentages (11 = 11%, 2.94 = 2.94%).
                </p>
                <p className="text-sky-700 dark:text-sky-300">
                  <strong>Fallback:</strong> with no booking, the same formula runs on the{' '}
                  <Sheet name="SMU" /> row for the 3LC route with the <strong>highest all-in cost per kg</strong>{' '}
                  — ranked on the full expression above per kg, not on <Col name="freight_rate" /> alone, so the
                  estimate is the conservative one. That row&apos;s <Col name="sg_out" /> also drives SG Outgoing
                  below. NULL only when the route has no <Sheet name="SMU" /> row at all.
                </p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">RA Cost</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="SMU Rate CGK SPX" /> <Col name="ra" /> → <Sheet name="RA" /> <Col name="ra_name" /> (case &amp; punctuation-insensitive)
                </p>
                <p className="font-mono text-foreground/80">
                  (AWB_chargeable_weight × <Col name="rate" /> + <Col name="admin" />) × (1 + <Col name="ppn" /> / 100)
                </p>
                <p className="text-muted-foreground">
                  PPN applies to amount + admin. <strong>0 for Surabaya origin</strong> (no RA at SUB).
                  0 when <Col name="ra" /> starts with &quot;include&quot;.
                  NULL when the booking names an RA with no matching row in <Sheet name="RA" />.
                  <Col name="ppn" /> is stored as a percentage (e.g. 11 = 11% VAT).
                </p>
                <p className="text-sky-700 dark:text-sky-300">
                  <strong>Fallback:</strong> when there is no booking, or the booking&apos;s{' '}
                  <Col name="ra" /> is blank, the estimate uses the <strong>highest rate</strong> in{' '}
                  <Sheet name="RA" /> (ignoring &quot;include&quot; rows).
                </p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SG Outgoing Cost</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="SMU" /> <Col name="sg_out" /> → <Sheet name="SG Outgoing" /> <Col name="sg_outgoing_name" /> (case &amp; punctuation-insensitive)
                </p>
                <p className="font-mono text-foreground/80">
                  AWB_chargeable_weight × <Col name="rate" /> × (1 + <Col name="ppn" /> / 100) + <Col name="admin" />
                </p>
                <p className="text-muted-foreground">
                  Surabaya origin charges PPN on amount + admin instead:{' '}
                  <span className="font-mono">(weight × rate + admin) × (1 + ppn / 100)</span>.
                  0 when <Col name="sg_out" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="SG Outgoing" />.
                  <Col name="ppn" /> is stored as a percentage.
                </p>
                <p className="text-sky-700 dark:text-sky-300">
                  <strong>Fallback:</strong> same join and formula, keyed off the{' '}
                  <Col name="sg_out" /> of the SMU row the route fallback picked. An unmatched name
                  costs 0 rather than NULL, so a missing SG Outgoing entry cannot nullify the whole estimate.
                </p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SG Incoming Cost (per TO)</p>
                <p className="text-muted-foreground">
                  Join: the resolved route above → <Sheet name="SG Incoming" /> <Col name="origin" /> ×{' '}
                  <Col name="destination" />
                </p>
                <p className="font-mono text-foreground/80">
                  weight_share × (AWB_chargeable_weight × <Col name="sg_inc" /> + admin)
                </p>
                <p className="text-muted-foreground">
                  Uses chargeable weight plus an admin, prorated to each TO by weight share so the admin is counted
                  once per AWB. The admin comes from <Sheet name="SG Incoming" /> <Col name="admin" />; only when
                  that is blank does it fall back to 5,000 for CGK/Jabo and 0 for Surabaya. Shown as NULL when the
                  route has no matching row in <Sheet name="SG Incoming" />, but Total Cost treats a missing route
                  as 0 so it is not nullified.
                </p>
                <p className="text-sky-700 dark:text-sky-300">
                  <strong>Fallback:</strong> unchanged — this cost is keyed on the resolved route, so it no
                  longer waits on a booking. Without one it uses gross weight in place of chargeable weight.
                </p>
              </div>

              <div className="rounded border bg-muted/50 p-3 space-y-1">
                <p className="font-medium">Total Cost per TO</p>
                <p className="font-mono text-foreground/80">
                  (cost_smu + cost_ra + cost_sg_out) × weight_share + cost_sg_in
                </p>
                <p className="text-muted-foreground">
                  AWB-level costs are prorated by weight share; SG Incoming is per-TO.
                </p>
              </div>
            </div>
          </Section>

          <Divider />

          {/* ── PRORATION ── */}
          <Section title="4. Proration to Transport Order">
            <p className="mb-2 text-muted-foreground">
              AWB cost is shared across all TOs under that AWB proportionally by gross weight.
              Source: <Sheet name="Compile Air CGK" /> <Col name="gross_weight" />
            </p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Weight share</td>
                  <td className="py-1.5 font-mono text-foreground/80">TO_gross_weight / SUM(gross_weight per AWB)</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Cost per TO</td>
                  <td className="py-1.5 font-mono text-foreground/80">cost_per_AWB × weight_share</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── SUMMARY ── */}
          <Section title="5. Summary Totals">
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Est. Revenue</td>
                  <td className="py-1.5 font-mono text-foreground/80">SUM(revenue_total) — all TOs in cycle</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Est. Cost</td>
                  <td className="py-1.5 font-mono text-foreground/80">SUM(cost_to) — only TOs with complete cost data</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Est. Gross Profit</td>
                  <td className="py-1.5 font-mono text-foreground/80">Est. Revenue − Est. Discount − Est. Cost</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Est. Gross Margin</td>
                  <td className="py-1.5 font-mono text-foreground/80">(Gross Profit / Revenue) × 100</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-muted-foreground">
              TOs with missing cost data (no matching rate row) contribute to revenue but not to cost —
              see the Data Quality panel below for details.
            </p>
          </Section>

        </div>
      )}
    </div>
  )
}
