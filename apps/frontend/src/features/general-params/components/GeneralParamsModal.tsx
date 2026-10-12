'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGeneralParams } from '../hooks/useGeneralParams'

/**
 * Config rows managed by their own dedicated UI (not raw text fields in this modal).
 * All SLA column layouts (air `sla_column_layout`, sea `sea_sla_column_layout`, and any
 * future per-mode key) are reordered from the table's column dropdown, so they never
 * appear here.
 */
const isHiddenParam = (key: string) => key.endsWith('sla_column_layout')

interface GeneralParamsModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function GeneralParamsModal({ open, onClose, onSaved }: GeneralParamsModalProps) {
  const { params, update, saving } = useGeneralParams()
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && params.length > 0) {
      const initial: Record<string, string> = {}
      for (const p of params) initial[p.key] = p.value
      setDraft(initial)
    }
  }, [open, params])

  const handleSave = async () => {
    for (const p of params) {
      if (isHiddenParam(p.key)) continue
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
          {params.filter((p) => !isHiddenParam(p.key)).map((p) => (
            <div key={p.key} className="space-y-1.5">
              <label htmlFor={`param-${p.key}`} className="text-sm font-medium text-foreground">
                {p.label}
              </label>

              <div className="flex items-center gap-2">
                <input
                  id={`param-${p.key}`}
                  type="number"
                  min={0}
                  step={p.key.includes('hours') ? 0.5 : 1}
                  value={draft[p.key] ?? p.value}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="tabular w-full rounded-sm border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {p.key.includes('hours') ? 'hour(s)' : 'day(s)'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
