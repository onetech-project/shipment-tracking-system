'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { fromPayload, toPayloadWithSource } from '../engine'
import { ReducerState, SimAction } from '../state/reducer'
import {
  useCreateScenario, useDeleteScenario, useScenario, useScenarios, useUpdateScenario,
} from '../hooks/useRouteSimulation'
import { Tag } from './ui'

type ApiError = { response?: { status?: number; data?: { message?: string | string[] } } }
const messageOf = (err: unknown) => {
  const m = (err as ApiError)?.response?.data?.message
  return Array.isArray(m) ? m.join(', ') : m ?? 'Gagal menyimpan skenario'
}

export function ScenarioBar({ state, dispatch, onFlash }: { state: ReducerState; dispatch: React.Dispatch<SimAction>; onFlash: (msg: string) => void }) {
  const { hasPermission } = usePermissions()
  const [openId, setOpenId] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const list = useScenarios(true)
  const detail = useScenario(openId)
  const create = useCreateScenario()
  const update = useUpdateScenario()
  const remove = useDeleteScenario()

  // Opening a scenario replaces the working state once, when its payload arrives.
  useEffect(() => {
    const d = detail.data
    if (!d || d.id !== openId) return
    setRevision(d.revision)
    if (d.payload) dispatch({ type: 'load', sim: fromPayload(state.source, d.payload) })
    // openId is a dep because a cached detail can already be present when the user picks it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, detail.data?.id, detail.data?.revision])

  const current = list.data?.find((s) => s.id === openId)
  const payload = () => toPayloadWithSource(state.source, state.sim)

  const pick = (id: string) => {
    if (state.dirty && !window.confirm('Perubahan yang belum disimpan akan hilang. Lanjut?')) return
    setOpenId(id || null)
    setRevision(null)
  }

  const saveAs = async () => {
    const name = window.prompt('Nama skenario', current ? `${current.name} (salinan)` : '')?.trim()
    if (!name) return
    try {
      const saved = await create.mutateAsync({ name, payload: payload() })
      setOpenId(saved.id)
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash(`Skenario "${name}" disimpan`)
    } catch (err) {
      onFlash(messageOf(err))
    }
  }

  const save = async () => {
    if (!openId || revision == null) return saveAs()
    try {
      const saved = await update.mutateAsync({ id: openId, body: { revision, payload: payload() } })
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash('Skenario disimpan')
    } catch (err) {
      if ((err as ApiError)?.response?.status === 409) {
        onFlash('Skenario ini sudah disimpan orang lain setelah kamu membukanya. Buka ulang skenario, atau simpan sebagai skenario baru.')
      } else onFlash(messageOf(err))
    }
  }

  const del = async () => {
    if (!current || !window.confirm(`Hapus skenario "${current.name}"?`)) return
    await remove.mutateAsync(current.id)
    setOpenId(null)
    setRevision(null)
    onFlash('Skenario dihapus')
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
          <Button size="sm" onClick={save} disabled={update.isPending || !state.dirty}>Simpan</Button>
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
