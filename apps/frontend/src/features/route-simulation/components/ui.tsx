'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Account, Scope, SimRoute, SimState, SimulationSource } from '../types'
import { NO_GROUP, groupNames, groupsOfRoute, routeKey, routeLabel } from '../engine'
import { SimAction } from '../state/reducer'
import { fmtIdr } from '../utils/format'

export interface TabProps {
  source: SimulationSource
  sim: SimState
  dispatch: React.Dispatch<SimAction>
}

export const TAB_IDS = ['setup', 'smu', 'rate', 'history', 'routes', 'compare', 'actual', 'distribute', 'sim'] as const
export type TabId = (typeof TAB_IDS)[number]

// Local tone resolver (format.ts is pure-logic and out of this task's scope): same sign test as
// utils/format.ts's toneClass, restyled onto the good/bad tokens instead of its hardcoded hues.
const toneCls = (n: number) => (n < 0 ? 'text-bad' : 'text-good')

export const Signed = ({ value }: { value: number }) => <span className={toneCls(value)}>{fmtIdr(value)}</span>

export const RouteChip = ({ route }: { route: Pick<SimRoute, 'originLabel' | 'dest'> }) => (
  <span data-route-chip className="whitespace-nowrap font-display font-bold">{routeLabel(route)}</span>
)

const TAG_TONES = {
  plain: 'border-border text-foreground',
  esp: 'border-warn/30 bg-warn-soft text-warn-ink',
  best: 'border-brand-line bg-good-soft text-brand-ink',
  warn: 'border-bad/25 bg-bad-soft text-bad',
}

export const Tag = ({ tone = 'plain', children }: { tone?: keyof typeof TAG_TONES; children: React.ReactNode }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', TAG_TONES[tone])}>{children}</span>
)

export const EspTag = ({ account }: { account?: Account }) => (account?.isEsp ? <> <Tag tone="esp">ESP</Tag></> : null)

export const Kpi = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: number }) => (
  <div>
    <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
    <div className={cn('font-display text-base font-bold tabular [overflow-wrap:anywhere]', tone != null && toneCls(tone))}>{value}</div>
  </div>
)

export const Hint = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn('text-xs text-muted-foreground', className)}>{children}</p>
)

// Commits on blur or Enter, never per keystroke: each commit can re-run the LP, and the prototype
// used the `change` event for the same reason. Local text state lets the user clear the field.
export function NumInput({
  value, onCommit, step = 1, min = 0, className, edited, ariaLabel, disabled, placeholder,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  step?: number
  min?: number
  className?: string
  edited?: boolean
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const next = text.trim() === '' ? null : Number(text)
    if (next !== null && Number.isNaN(next)) return setText(value == null ? '' : String(value))
    if (next !== value) onCommit(next)
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      step={step}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        FIELD, 'font-display tabular text-right disabled:opacity-50',
        edited && 'border-warn focus-visible:border-warn',
        className,
      )}
    />
  )
}

// Shared field look across this feature's hand-rolled selects/inputs, matching Input's own
// styling (see components/ui/input.tsx) so every control in Simulasi Rute reads as one field style.
export const FIELD = 'h-8 rounded-[7px] border border-input bg-card px-2.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40'

export interface RouteFilter {
  group: string // 'all' | group id | NO_GROUP.id
  q: string
}

export function visibleRoutes(source: SimulationSource, sim: SimState, f: RouteFilter): SimRoute[] {
  const q = f.q.trim().toLowerCase()
  const inGroup = (r: SimRoute) =>
    f.group === 'all' ||
    (f.group === NO_GROUP.id ? !groupsOfRoute(source, r.key).length : groupsOfRoute(source, r.key).some((g) => g.id === f.group))
  return sim.routes.filter((r) => inGroup(r) && (!q || routeLabel(r).toLowerCase().includes(q)))
}

export function RouteFilterBar({ source, value, onChange }: { source: SimulationSource; value: RouteFilter; onChange: (f: RouteFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Grup rute"
        className={FIELD}
        value={value.group}
        onChange={(e) => onChange({ ...value, group: e.target.value })}
      >
        <option value="all">Semua grup rute</option>
        {source.routeGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        <option value={NO_GROUP.id}>{NO_GROUP.name}</option>
      </select>
      <input
        type="search"
        aria-label="Cari rute"
        placeholder="Cari rute"
        className={FIELD}
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
      />
    </div>
  )
}

export function ScopePicker({ source, sim, scope, onChange }: { source: SimulationSource; sim: SimState; scope: Scope; onChange: (s: Scope) => void }) {
  const toggle = (kind: 'groups' | 'routes', id: string, on: boolean) => {
    const next = new Set(scope[kind])
    if (on) next.add(id)
    else next.delete(id)
    onChange({ ...scope, [kind]: next })
  }
  const nG = source.routeGroups.filter((g) => scope.groups.has(g.id)).length
  const nR = sim.routes.filter((r) => scope.routes.has(r.key)).length
  return (
    <details className="w-full">
      <summary className="inline-block cursor-pointer rounded-sm border border-input bg-card px-2.5 py-1 text-[12.5px] font-medium">
        Grup rute: {nG} dari {source.routeGroups.length} · Rute satu-satu: {nR} dari {sim.routes.length}
      </summary>
      <div className="mt-3 grid gap-5 border-t pt-3 md:grid-cols-3">
        <fieldset>
          <legend className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Grup rute</legend>
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded-sm border border-input bg-card px-2 py-0.5 text-[12.5px] font-medium hover:bg-surface-2" onClick={() => onChange({ ...scope, groups: new Set(source.routeGroups.map((g) => g.id)) })}>Semua grup</button>
            <button type="button" className="rounded-sm border border-input bg-card px-2 py-0.5 text-[12.5px] font-medium hover:bg-surface-2" onClick={() => onChange({ ...scope, groups: new Set() })}>Kosongkan</button>
          </div>
          {source.routeGroups.length ? source.routeGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={scope.groups.has(g.id)} onChange={(e) => toggle('groups', g.id, e.target.checked)} />
              {g.name} <span className="text-xs text-muted-foreground">{sim.routes.filter((r) => g.routes.some((x) => routeKey(x) === r.key)).length} rute</span>
            </label>
          )) : <Hint>Belum ada grup rute.</Hint>}
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Rute satu-satu</legend>
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded-sm border border-input bg-card px-2 py-0.5 text-[12.5px] font-medium hover:bg-surface-2" onClick={() => onChange({ ...scope, routes: new Set(sim.routes.map((r) => r.key)) })}>Semua rute</button>
            <button type="button" className="rounded-sm border border-input bg-card px-2 py-0.5 text-[12.5px] font-medium hover:bg-surface-2" onClick={() => onChange({ ...scope, routes: new Set() })}>Kosongkan</button>
          </div>
          <div className="grid gap-x-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
            {sim.routes.map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={scope.routes.has(r.key)} onChange={(e) => toggle('routes', r.key, e.target.checked)} />
                <RouteChip route={r} /> <span className="text-xs text-muted-foreground">{groupNames(source, r.key)}</span>
              </label>
            ))}
          </div>
          <Hint className="mt-2">Rute yang sudah tampil lewat grup yang dicentang tidak diulang di bagian Rute pilihan.</Hint>
        </fieldset>
      </div>
    </details>
  )
}

// Shared table styles, matching the mockup's akun-table/grid-t look.
export const TH = 'whitespace-nowrap border-b bg-table-head px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground'
export const THN = cn(TH, 'text-right')
export const TD = 'border-b px-2.5 py-[9px] align-middle text-xs'
export const TDN = cn(TD, 'whitespace-nowrap text-right tabular')
// Leaf data rows (one lane, tranche, or history line): a faint hover so a dense table stays easy
// to scan. Band/group/subtotal/grand rows below keep their own flat background instead.
export const ROW = 'motion-safe:transition-colors hover:bg-row-hover'
// `.smu-rute-head`'s background — the per-route band row that groups lanes/entries beneath it.
export const ROW_BAND = 'bg-surface-3 font-semibold [&>td]:border-t'
// `.pbrute-group-head` — a route-group header inside Perbandingan per Rute.
export const ROW_GROUP = 'bg-brand-soft font-bold text-brand-ink'
// `.total-row`'s background.
export const ROW_SUBTOTAL = 'bg-table-head font-semibold'
export const ROW_GRAND = 'bg-foreground font-semibold text-background [&_span]:!text-background'
