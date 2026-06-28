'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiClient } from '@/shared/api/client'
import { useGeneralParams } from '../hooks/useGeneralParams'
import type { GoogleSheetConfig } from '@/features/air-shipments/types'

interface SheetOption {
  label: string
  tableName: string
}

const TABLE_SELECT_KEYS = new Set(['reservasi_table_name'])

/** Config rows managed by their own dedicated UI (not raw text fields in this modal). */
const HIDDEN_KEYS = new Set(['sla_column_layout'])

interface GeneralParamsModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function GeneralParamsModal({ open, onClose, onSaved }: GeneralParamsModalProps) {
  const { params, update, saving } = useGeneralParams()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [sheetOptions, setSheetOptions] = useState<SheetOption[]>([])

  useEffect(() => {
    if (open && params.length > 0) {
      const initial: Record<string, string> = {}
      for (const p of params) initial[p.key] = p.value
      setDraft(initial)
    }
  }, [open, params])

  useEffect(() => {
    if (!open) return
    apiClient.get<GoogleSheetConfig[]>('/air-shipments/google-sheet-config').then((res) => {
      const options: SheetOption[] = []
      for (const config of res.data) {
        for (const sheet of config.sheetConfigs ?? []) {
          options.push({
            label: config.label ? `${config.label} — ${sheet.sheetName}` : sheet.sheetName,
            tableName: sheet.tableName,
          })
        }
      }
      setSheetOptions(options)
    })
  }, [open])

  const handleSave = async () => {
    for (const p of params) {
      if (HIDDEN_KEYS.has(p.key)) continue
      const newVal = draft[p.key]
      if (newVal !== undefined && newVal !== p.value) {
        await update(p.key, newVal)
      }
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Alert Parameters</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {params.filter((p) => !HIDDEN_KEYS.has(p.key)).map((p) => (
            <div key={p.key} className="space-y-1.5">
              <label htmlFor={`param-${p.key}`} className="text-sm font-medium text-foreground">
                {p.label}
              </label>

              {TABLE_SELECT_KEYS.has(p.key) ? (
                <select
                  id={`param-${p.key}`}
                  value={draft[p.key] ?? p.value}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Choose sheet —</option>
                  {sheetOptions.map((opt) => (
                    <option key={opt.tableName} value={opt.tableName}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    id={`param-${p.key}`}
                    type="number"
                    min={0}
                    step={p.key.includes('hours') ? 0.5 : 1}
                    value={draft[p.key] ?? p.value}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {p.key.includes('hours') ? 'hour(s)' : 'day(s)'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
