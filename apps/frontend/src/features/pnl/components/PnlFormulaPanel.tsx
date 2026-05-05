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
              The billing cycle is assigned by <em>arrival date</em> (<Col name="completed_time" /> or{' '}
              <Col name="ata_vendor_wh_destination" />), which indicates when the shipment reached the destination —
              not when the customer was invoiced or paid.
            </p>
          </div>

          <Divider />

          {/* ── BILLING CYCLE ── */}
          <Section title="1. Billing Cycle Assignment">
            <p className="mb-2 text-muted-foreground">Source: <Sheet name="Compile Air CGK" /></p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-40">Primary date</td>
                  <td className="py-1.5"><Col name="completed_time" /> — date the TO was marked complete</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Fallback date</td>
                  <td className="py-1.5">
                    <Col name="ata_vendor_wh_destination" /> — used when <Col name="completed_time" /> is blank,
                    only if the value looks like a date (starts with a digit)
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Supported formats</td>
                  <td className="py-1.5 font-mono text-foreground/80">
                    <Col name="DD-Mon-YYYY HH:MM" /> and <Col name="D Mon YYYY H:MM" /> (single-digit day)
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Cycle label</td>
                  <td className="py-1.5">
                    <Col name="YYYY-MM-1H" /> for days 1–15 · <Col name="YYYY-MM-2H" /> for days 16–31
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
                <tr className="font-medium">
                  <td className="py-1.5 pr-4">= Revenue per TO</td>
                  <td className="py-1.5 font-mono">amount_revenue + packing_kayu</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── COST LOOKUP ── */}
          <Section title="3. Cost Lookup (per AWB)">
            <p className="mb-3 text-muted-foreground">
              The booking entry in <Sheet name="SMU Rate CGK SPX" /> maps each AWB to its vendor, airline, and rate tables.
              Cost is computed at AWB level then prorated to each TO by weight share.
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
                  total_AWB_weight × <Col name="total_cost_smukg" /> + <Col name="admin_smu" />
                </p>
                <p className="text-muted-foreground">NULL when no matching row in <Sheet name="SMU" /></p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">RA Cost</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="SMU Rate CGK SPX" /> <Col name="ra" /> → <Sheet name="RA" /> <Col name="ra_name" /> (case-insensitive)
                </p>
                <p className="font-mono text-foreground/80">
                  total_AWB_weight × <Col name="rate" /> × (1 + <Col name="ppn" /> / 100) + <Col name="admin" />
                </p>
                <p className="text-muted-foreground">
                  0 when <Col name="ra" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="RA" />.
                  <Col name="ppn" /> is stored as a percentage (e.g. 11 = 11% VAT).
                </p>
              </div>

              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SG Outgoing Cost</p>
                <p className="text-muted-foreground">
                  Join: <Sheet name="SMU" /> <Col name="sg_out" /> → <Sheet name="SG Outgoing" /> <Col name="sg_outgoing_name" />
                </p>
                <p className="font-mono text-foreground/80">
                  total_AWB_weight × <Col name="rate" /> × (1 + <Col name="ppn" /> / 100) + <Col name="admin" />
                </p>
                <p className="text-muted-foreground">
                  0 when <Col name="sg_out" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="SG Outgoing" />.
                  <Col name="ppn" /> is stored as a percentage.
                </p>
              </div>

              <div className="rounded border bg-muted/50 p-3 space-y-1">
                <p className="font-medium">Total Cost per AWB</p>
                <p className="font-mono text-foreground/80">cost_smu + cost_ra + cost_sg_out</p>
                <p className="text-muted-foreground">NULL if any component is NULL (cost lookup failed)</p>
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
                  <td className="py-1.5 font-mono text-foreground/80">Est. Revenue − Est. Cost</td>
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
