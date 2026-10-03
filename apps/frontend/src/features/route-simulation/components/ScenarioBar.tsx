'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { fromPayload, isScenarioPayload, toPayloadWithSource } from '../engine'
import { ReducerState, SimAction } from '../state/reducer'
import {
  useCreateScenario, useDeleteScenario, useScenario, useScenarios, useUpdateScenario,
} from '../hooks/useRouteSimulation'
import { Tag } from './ui'

// Must match useScenario's queryKey in hooks/useRouteSimulation.ts.
const scenarioDetailKey = (id: string | null) => ['route-simulation', 'scenarios', id] as const

type ApiError = { response?: { status?: number; data?: { message?: string | string[] } } }
const messageOf = (err: unknown) => {
  const m = (err as ApiError)?.response?.data?.message
  return Array.isArray(m) ? m.join(', ') : m ?? 'Gagal menyimpan skenario'
}

export function ScenarioBar({ state, dispatch, onFlash }: { state: ReducerState; dispatch: React.Dispatch<SimAction>; onFlash: (msg: string) => void }) {
  const { hasPermission } = usePermissions()
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const list = useScenarios(true)
  const detail = useScenario(openId)
  const create = useCreateScenario()
  const update = useUpdateScenario()
  const remove = useDeleteScenario()

  // The working state is replaced by a server payload ONLY as the direct result of an explicit
  // pick(), exactly once per pick. loadedFor holds the "id:revision" applied (or written by a save)
  // since the last pick; pick() resets it to null, and nothing else does — so a refetch, a 409, a
  // save or a delete can never dispatch `load` over the user's edits.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    const d = detail.data
    // isFetching: never apply a payload that a fetch in flight is about to replace.
    if (!d || d.id !== openId || detail.isFetching || loadedFor.current !== null) return
    loadedFor.current = `${d.id}:${d.revision}`
    if (!isScenarioPayload(d.payload)) {
      // Drop the selection too: Simpan must not write the unrelated working state into it.
      setOpenId(null)
      setRevision(null)
      onFlash('Skenario ini tidak bisa dibuka: format datanya tidak dikenal.')
      return
    }
    setRevision(d.revision)
    dispatch({ type: 'load', sim: fromPayload(state.source, d.payload) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, detail.data?.id, detail.data?.revision, detail.isFetching])

  const current = list.data?.find((s) => s.id === openId)
  const payload = () => toPayloadWithSource(state.source, state.sim)

  const pick = (id: string) => {
    if (state.dirty && !window.confirm('Perubahan yang belum disimpan akan hilang. Lanjut?')) return
    const nextId = id || null
    // Never trust a cached detail: drop it so the new observer starts from data === undefined and
    // the effect above loads exactly once, from a fresh fetch of the latest revision.
    if (nextId) queryClient.removeQueries({ queryKey: scenarioDetailKey(nextId), exact: true })
    loadedFor.current = null
    setOpenId(nextId)
    setRevision(null)
  }

  const saveAs = async () => {
    const name = window.prompt('Nama skenario', current ? `${current.name} (salinan)` : '')?.trim()
    if (!name) return
    try {
      const saved = await create.mutateAsync({ name, payload: payload() })
      // The working state IS this revision: its detail fetch must not load it back over later edits.
      loadedFor.current = `${saved.id}:${saved.revision}`
      setOpenId(saved.id)
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash(`Skenario "${name}" disimpan`)
    } catch (err) {
      onFlash(messageOf(err))
    }
  }

  const save = async () => {
    // Simpan is only rendered with an openId, and is disabled below while its detail (and so its
    // revision) is still loading — so there is nothing sensible to fall through to here.
    if (!openId || revision == null) return
    try {
      const saved = await update.mutateAsync({ id: openId, body: { revision, payload: payload() } })
      loadedFor.current = `${openId}:${saved.revision}`
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash('Skenario disimpan')
    } catch (err) {
      if ((err as ApiError)?.response?.status === 409) {
        // Leave the cache and the working state alone: refetching here would reload the newer
        // revision over the user's unsaved edits. The next pick() drops the cached detail anyway.
        onFlash('Skenario ini sudah disimpan orang lain setelah kamu membukanya. Pilih "Baru" lalu buka skenario ini lagi untuk memuat versi terbaru, atau simpan sebagai skenario baru.')
      } else onFlash(messageOf(err))
    }
  }

  const del = async () => {
    if (!current || !window.confirm(`Hapus skenario "${current.name}"?`)) return
    try {
      await remove.mutateAsync(current.id)
      setOpenId(null)
      setRevision(null)
      onFlash('Skenario dihapus')
    } catch (err) {
      onFlash(messageOf(err))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Skenario</span>
        <select aria-label="Skenario" className="h-8 min-w-48 rounded border border-input bg-background px-2 text-sm" value={openId ?? ''} onChange={(e) => pick(e.target.value)}>
          <option value="">Baru (belum disimpan)</option>
          {list.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {current && <span className="text-xs text-muted-foreground">diubah {new Date(current.updatedAt).toLocaleString('id-ID')}{current.updatedBy ? ` oleh ${current.updatedBy}` : ''}</span>}
      {state.dirty && <Tag tone="warn">Belum disimpan</Tag>}
      <div className="ml-auto flex gap-2">
        {openId && hasPermission('update.route_simulation') && (
          <Button size="sm" onClick={save} disabled={update.isPending || !state.dirty || revision == null}>Simpan</Button>
        )}
        {hasPermission('create.route_simulation') && (
          <Button size="sm" variant="outline" onClick={saveAs} disabled={create.isPending}>Simpan sebagai…</Button>
        )}
        {openId && hasPermission('delete.route_simulation') && (
          <Button size="sm" variant="outline" className="text-red-700 dark:text-red-400" onClick={del} disabled={remove.isPending}>Hapus</Button>
        )}
      </div>
    </div>
  )
}
