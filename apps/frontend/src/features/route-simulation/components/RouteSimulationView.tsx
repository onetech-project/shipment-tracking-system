'use client'

import React, { useEffect, useReducer, useState } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import { SimulationSource } from '../types'
import { initReducer, simReducer } from '../state/reducer'
import { periodShort } from '../engine'
import { TAB_IDS, TabId } from './ui'
import { ScenarioBar } from './ScenarioBar'
import { SetupTab } from './tabs/SetupTab'
import { LanesTab } from './tabs/LanesTab'
import { RateTab } from './tabs/RateTab'
import { HistoryTab } from './tabs/HistoryTab'
import { RoutesTab } from './tabs/RoutesTab'
import { CompareTab } from './tabs/CompareTab'
import { ActualTab } from './tabs/ActualTab'
import { OptimalTab } from './tabs/OptimalTab'
import { SimTab } from './tabs/SimTab'

const TAB_LABELS: Record<TabId, string> = {
  setup: '1 · Setup Histori & Akun',
  smu: '2 · SMU Rute',
  rate: '3 · Rate Card SPX',
  history: '4 · Historical PnL',
  routes: '5 · Rute & Slot Time',
  compare: '6 · Perbandingan per Rute',
  actual: '7 · Distribusi Aktual',
  distribute: '8 · Distribusi Optimal',
  sim: '9 · Coba-coba',
}

export function RouteSimulationView({ source }: { source: SimulationSource }) {
  const [state, dispatch] = useReducer(simReducer, source, (s) => initReducer(s))
  const [tab, setTab] = useState<TabId>('setup')
  const [flash, setFlash] = useState<{ text: string; seq: number } | null>(null)
  const { sim } = state

  // seq bumps on every call, even when text repeats, so the object below is always new and the
  // timer effect (keyed on flash) always restarts — setFlash with the same string would otherwise
  // bail out and leave a stale timer running.
  const show = (text: string) => setFlash((f) => ({ text, seq: (f?.seq ?? 0) + 1 }))

  // Keyed on the whole state, not state.flash: pressing Run twice yields the same message twice,
  // and the second toast must still show. flash is cleared by every other action, so a non-null
  // flash here always belongs to the dispatch that produced this state.
  useEffect(() => {
    if (state.flash) show(state.flash)
  }, [state])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash]) // flash is a fresh object every call (seq bumps), so a repeated message re-arms this

  useEffect(() => {
    if (!state.dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.dirty])

  const props = { source, sim, dispatch }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Simulasi Rekomendasi Rute"
        subtitle="Distribusi modal vendor ke rute dan airlines, dihitung per hari."
        action={
          <p className="text-right text-xs font-medium text-muted-foreground">
            Histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)}
            <br />Simulasi mulai {periodShort(sim.simStart)}, horizon {sim.horizonPeriods} periode
          </p>
        }
      />
      <ScenarioBar state={state} dispatch={dispatch} onFlash={show} />
      {/* Kept as plain buttons (not ModeTabs): the spec drives this nav by button role + aria-current,
          styled here to match ModeTabs' own look (see components/ui/segmented.tsx). */}
      <nav aria-label="Tab simulasi" className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-background px-1 py-2">
        <div className="inline-flex gap-0.5 whitespace-nowrap rounded-md bg-surface-2 p-1">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => { setTab(id); window.scrollTo(0, 0) }}
              className={cn(
                'whitespace-nowrap rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
                tab === id ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      </nav>
      <section className="space-y-4">
        {tab === 'setup' && <SetupTab {...props} />}
        {tab === 'smu' && <LanesTab {...props} />}
        {tab === 'rate' && <RateTab {...props} />}
        {tab === 'history' && <HistoryTab {...props} />}
        {tab === 'routes' && <RoutesTab {...props} />}
        {tab === 'compare' && <CompareTab {...props} />}
        {tab === 'actual' && <ActualTab {...props} />}
        {tab === 'distribute' && <OptimalTab {...props} onOpenSim={() => setTab('sim')} />}
        {tab === 'sim' && (
          <SimTab
            {...props}
            onRun={() => {
              setTab('distribute')
              show(`Estimasi dihitung ulang dengan vendor saat ini (${sim.horizonPeriods} periode mulai ${periodShort(sim.simStart)})`)
              window.scrollTo(0, 0)
            }}
          />
        )}
      </section>
      {flash && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-40 max-w-sm rounded-md bg-foreground px-3.5 py-2.5 text-sm text-background">
          {flash.text}
        </div>
      )}
    </div>
  )
}
