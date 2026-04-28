'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useGeneralParams } from '../hooks/useGeneralParams'

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
          {params.map((p) => (
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
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {p.key.includes('hours') ? 'hour(s)' : 'day(s)'}
                </span>
              </div>
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
