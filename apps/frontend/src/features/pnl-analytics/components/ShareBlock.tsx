'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { ShareResult, ShareRow } from '../utils/share'
import { UNATTRIBUTED } from '../utils/series'
import { MARGIN_GREY, SERIES_COLORS } from '../utils/theme'
import { AbsentNote, EmptyNote } from './AnalyticsNotes'
import { AnalyticsTable } from './AnalyticsTable'

interface ShareBlockProps {
  /** Plural noun for the entity, used in both notes: "Airlines", "RA providers". */
  what: string
  share: ShareResult | undefined
  isLoading: boolean
  isError: boolean
  /** Column header for the name column. Defaults to `what` minus its plural. */
  nameHeader?: string
}

/** Ranking bar for the top rows. The table below carries every row and all the exact numbers. */
const RANK_LIMIT = 8

export function ShareBlock({ what, share, isLoading, isError, nameHeader }: ShareBlockProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  // Checked before emptiness: a failed request and an empty period are different facts, and only
  // one of them says anything about the business.
  if (isError || !share) return <AbsentNote what={what} />
  if (!share.rows.length) return <EmptyNote what={what} />

  return (
    <div className="space-y-2">
      <p data-testid="share-attributed" className="text-xs text-muted-foreground">
        {pct(share.attributedPct)} of tonnage carries a name; the rest is grouped under{' '}
        {UNATTRIBUTED}.
      </p>

      {/* Horizontal ranking, the spec's `hBar`. Renders nothing at zero width (every jsdom test),
          which is why the table below is the thing specs assert on. */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={share.rows.slice(0, RANK_LIMIT)}
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `${num(Math.round(v))} kg`} />
            <Bar dataKey="weight" name="Weight">
              {share.rows.slice(0, RANK_LIMIT).map((r, i) => (
                // The unattributed bucket is not a competitor in this ranking; grey says so.
                <Cell
                  key={r.name}
                  fill={r.attributed ? SERIES_COLORS[i % SERIES_COLORS.length] : MARGIN_GREY}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <AnalyticsTable<ShareRow>
        columns={[
          {
            key: 'name',
            header: nameHeader ?? what,
            cell: (r) => (
              <span className={r.attributed ? '' : 'text-muted-foreground italic'}>{r.name}</span>
            ),
          },
          { key: 'weight', header: 'Weight', align: 'right', cell: (r) => num(Math.round(r.weight)) },
          { key: 'weightPct', header: 'Share', align: 'right', cell: (r) => pct(r.weightPct) },
          { key: 'cost', header: 'Cost', align: 'right', cell: (r) => fmt.format(r.cost) },
          { key: 'costPerKg', header: 'Cost / kg', align: 'right', cell: (r) => fmt.format(r.costPerKg) },
        ]}
        rows={share.rows}
        rowKey={(r) => r.name}
        rowClassName={(r) => (r.attributed ? undefined : 'bg-muted/40')}
      />
    </div>
  )
}
