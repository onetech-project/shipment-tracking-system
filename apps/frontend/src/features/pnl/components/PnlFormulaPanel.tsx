'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          <Section title="Revenue (per TO)">
            <Formula
              rows={[
                ['Freight revenue', 'amount_revenue'],
                ['+ Packing surcharge', 'packing_kayu (additional_amount_packing_kayu)'],
                ['= Revenue per TO', 'amount_revenue + packing_kayu'],
              ]}
            />
          </Section>

          <Section title="Cost (per AWB → prorated to TO)">
            <Formula
              rows={[
                ['SMU cost', 'total_GW_per_AWB × smu_rate_per_kg + admin_smu'],
                ['+ RA cost', 'total_GW_per_AWB × ra_rate × (1 + ppn) + admin_ra'],
                ['+ SG Outgoing', 'total_GW_per_AWB × sg_rate × (1 + ppn) + admin_sg'],
                ['= Cost per AWB', 'cost_smu + cost_ra + cost_sg_out'],
                ['→ Cost per TO', 'cost_per_AWB × (TO_weight / total_AWB_weight)'],
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              RA / SG cost is 0 when the rate name starts with &quot;include&quot; or is blank.
              Cost is NULL when the rate lookup has no matching row.
            </p>
          </Section>

          <Section title="Gross Profit &amp; Margin">
            <Formula
              rows={[
                ['Gross Profit', 'Revenue − Cost per TO'],
                ['Gross Margin %', '(Gross Profit / Revenue) × 100'],
              ]}
            />
          </Section>

          <Section title="Billing Cycle">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Derived from <code className="font-mono text-xs">completed_time</code> (falls back to{' '}
              <code className="font-mono text-xs">ata_vendor_wh_destination</code> when empty).
              Format: <code className="font-mono text-xs">YYYY-MM-1H</code> for days 1–15,{' '}
              <code className="font-mono text-xs">YYYY-MM-2H</code> for days 16–31.
            </p>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      {children}
    </div>
  )
}

function Formula({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([label, expr]) => (
          <tr key={label} className="border-b border-border/40 last:border-0">
            <td className="py-1 pr-4 text-muted-foreground w-44">{label}</td>
            <td className="py-1 font-mono text-foreground/80">{expr}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
