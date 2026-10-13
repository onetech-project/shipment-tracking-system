'use client'

import React, { useEffect, useReducer, useState } from 'react'
import { cn } from '@/lib/utils'
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
  const [flash, setFlash] = useState<string | null>(null)
  const { sim } = state

  // Keyed on the whole state, not state.flash: pressing Run twice yields the same message twice,
  // and the second toast must still show. flash is cleared by every other action, so a non-null
  // flash here always belongs to the dispatch that produced this state.
  useEffect(() => {
    if (state.flash) setFlash(state.flash)
  }, [state])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (!state.dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.dirty])

  const props = { source, sim, dispatch }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulasi Rekomendasi Rute</h1>
          <p className="text-sm text-muted-foreground">Distribusi modal vendor ke rute dan airlines, dihitung per hari.</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          Histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)}
          <br />Simulasi mulai {periodShort(sim.simStart)}, horizon {sim.horizonPeriods} periode
        </p>
      </div>
      <ScenarioBar state={state} dispatch={dispatch} onFlash={setFlash} />
      <nav aria-label="Tab simulasi" className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b bg-background">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => { setTab(id); window.scrollTo(0, 0) }}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium',
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
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
              setFlash(`Estimasi dihitung ulang dengan vendor saat ini (${sim.horizonPeriods} periode mulai ${periodShort(sim.simStart)})`)
              window.scrollTo(0, 0)
            }}
          />
        )}
      </section>
      {flash && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-40 max-w-sm rounded-md bg-foreground px-3.5 py-2.5 text-sm text-background">
          {flash}
        </div>
      )}
    </div>
  )
}
