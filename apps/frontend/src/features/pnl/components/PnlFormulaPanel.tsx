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
        <span className="font-medium">How is P&amp;L calculated?</span>
      </button>

      {open && (
        <div className="border-t px-4 pb-5 pt-4 space-y-5 text-xs">

          {/* ── REVENUE ── */}
          <Section title="1. Revenue (per Transport Order)">
            <p className="mb-2 text-muted-foreground">
              Source sheet: <Sheet name="Compile Air CGK" />
            </p>
            <table className="w-full">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-1 pr-4 text-left font-medium w-36">Line</th>
                  <th className="pb-1 pr-4 text-left font-medium w-44">Sheet column</th>
                  <th className="pb-1 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4">Freight revenue</td>
                  <td className="py-1.5 pr-4"><Col name="amount_revenue" /></td>
                  <td className="py-1.5 text-muted-foreground">IDR billed per TO</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">+ Packing surcharge</td>
                  <td className="py-1.5 pr-4"><Col name="additional_amount_packing_kayu" /></td>
                  <td className="py-1.5 text-muted-foreground">0 when blank</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1.5 pr-4">= Revenue per TO</td>
                  <td className="py-1.5 pr-4 font-mono text-foreground/80">amount_revenue + packing_kayu</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── COST LOOKUP ── */}
          <Section title="2. Cost Lookup (per AWB)">
            <p className="mb-3 text-muted-foreground">
              Cost is looked up at AWB level using the booking entry in{' '}
              <Sheet name="SMU Rate CGK SPX" />, then joined to three rate sheets.
            </p>

            <div className="space-y-3">
              {/* SMU */}
              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SMU Cost</p>
                <p className="text-muted-foreground">
                  Lookup key: <Sheet name="SMU Rate CGK SPX" /> <Col name="account" /> ×{' '}
                  <Col name="airlines" /> × <Col name="via" /> × <Col name="dest" />{' '}
                  → <Sheet name="SMU" /> <Col name="vendor" /> × <Col name="airlines" /> ×{' '}
                  <Col name="origin" /> × <Col name="destination" />
                </p>
                <p className="font-mono text-foreground/80">
                  total_AWB_weight × <Col name="total_cost_smu_per_kg" /> + <Col name="admin_smu" />
                </p>
                <p className="text-muted-foreground">NULL when no matching row in <Sheet name="SMU" /></p>
              </div>

              {/* RA */}
              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">RA Cost</p>
                <p className="text-muted-foreground">
                  Lookup key: <Sheet name="SMU Rate CGK SPX" /> <Col name="ra" />{' '}
                  → <Sheet name="RA" /> <Col name="ra_name" /> (case-insensitive)
                </p>
                <p className="font-mono text-foreground/80">
                  total_AWB_weight × <Col name="rate" /> × (1 + <Col name="ppn" />) + <Col name="admin" />
                </p>
                <p className="text-muted-foreground">
                  0 when <Col name="ra" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="RA" />
                </p>
              </div>

              {/* SG Outgoing */}
              <div className="rounded border p-3 space-y-1.5">
                <p className="font-medium">SG Outgoing Cost</p>
                <p className="text-muted-foreground">
                  Lookup key: <Sheet name="SMU" /> <Col name="sg_out" />{' '}
                  → <Sheet name="SG Outgoing" /> <Col name="sg_outgoing_name" />
                </p>
                <p className="font-mono text-foreground/80">
                  total_AWB_weight × <Col name="rate" /> × (1 + <Col name="ppn" />) + <Col name="admin" />
                </p>
                <p className="text-muted-foreground">
                  0 when <Col name="sg_out" /> is blank or starts with &quot;include&quot;.
                  NULL when no matching row in <Sheet name="SG Outgoing" />
                </p>
              </div>

              {/* Total */}
              <div className="rounded border bg-muted/50 p-3 space-y-1">
                <p className="font-medium">Total Cost per AWB</p>
                <p className="font-mono text-foreground/80">cost_smu + cost_ra + cost_sg_out</p>
                <p className="text-muted-foreground">NULL if any component is NULL</p>
              </div>
            </div>
          </Section>

          <Divider />

          {/* ── PRORATION ── */}
          <Section title="3. Proration to Transport Order">
            <p className="mb-2 text-muted-foreground">
              AWB cost is shared across all TOs under that AWB proportionally by gross weight.
              Source: <Sheet name="Compile Air CGK" /> <Col name="gross_weight" />
            </p>
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-44">Weight share</td>
                  <td className="py-1.5 font-mono text-foreground/80">TO_gross_weight / sum(gross_weight per AWB)</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Cost per TO</td>
                  <td className="py-1.5 font-mono text-foreground/80">cost_per_AWB × weight_share</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── GROSS PROFIT ── */}
          <Section title="4. Gross Profit &amp; Margin">
            <table className="w-full">
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-1.5 pr-4 w-44">Gross Profit</td>
                  <td className="py-1.5 font-mono text-foreground/80">Revenue − Cost per TO</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4">Gross Margin %</td>
                  <td className="py-1.5 font-mono text-foreground/80">(Gross Profit / Revenue) × 100</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Divider />

          {/* ── BILLING CYCLE ── */}
          <Section title="5. Billing Cycle Assignment">
            <p className="text-muted-foreground leading-relaxed">
              Derived from <Sheet name="Compile Air CGK" /> <Col name="completed_time" />.
              Falls back to <Col name="ata_vendor_wh_destination" /> when{' '}
              <Col name="completed_time" /> is blank (and the value looks like a{' '}
              <Col name="DD-Mon-YYYY" /> date).
              Format: <Col name="YYYY-MM-1H" /> = days 1–15,{' '}
              <Col name="YYYY-MM-2H" /> = days 16–31.
            </p>
          </Section>

        </div>
      )}
    </div>
  )
}
