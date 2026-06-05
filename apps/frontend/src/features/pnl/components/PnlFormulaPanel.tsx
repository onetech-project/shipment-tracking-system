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
            <p className="mb-2 text-muted-foreground">Source: <Sheet name="Compile Air CGK" /></p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Freight revenue</td>
                  <td className="py-1.5"><Col name="amount_revenue" /></td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">+ Packing surcharge</td>
                  <td className="py-1.5"><Col name="additional_amount_packing_kayu" /> (0 when blank)</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">− Discount (1.5%)</td>
                  <td className="py-1.5"><Col name="amount_revenue" /> × 1.5% (freight revenue only)</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1.5 pr-4">= Revenue per TO</td>
                  <td className="py-1.5 font-mono">amount_revenue − (amount_revenue × 1.5%) + packing_kayu</td>
                </tr>
              </tbody>
            </table>
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

            <div className="space-y-3">
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
                  NULL when no matching row in <Sheet name="SMU" />.
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
                  0 when <Col name="ra" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="RA" />.
                  <Col name="ppn" /> is stored as a percentage (e.g. 11 = 11% VAT).
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
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SG Incoming Cost (per TO)</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="Compile Air CGK" /> <Col name="origin_station" /> ×{' '}
                  <Col name="destination_station" /> → <Sheet name="SG Incoming" /> <Col name="origin" /> ×{' '}
                  <Col name="destination" />
                </p>
                <p className="font-mono text-foreground/80">
                  weight_share × (AWB_chargeable_weight × <Col name="sg_inc" /> + admin)
                </p>
                <p className="text-muted-foreground">
                  Looked up per route (<Col name="origin_station" /> × <Col name="destination_station" />). Uses
                  chargeable weight plus a flat admin (5,000 for CGK/Jabo, 0 for Surabaya), prorated to each TO by
                  weight share so the admin is counted once per AWB. Shown as NULL when no matching route in{' '}
                  <Sheet name="SG Incoming" />, but Total Cost treats a missing route as 0 so it is not nullified.
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
                  <td className="py-1.5 pr-4">Est. Discount</td>
                  <td className="py-1.5 font-mono text-foreground/80">SUM(amount_revenue × 1.5%) — all TOs in cycle</td>
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
