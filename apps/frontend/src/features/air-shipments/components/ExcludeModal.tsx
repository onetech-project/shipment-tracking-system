'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import Spinner from '@/components/ui/spinner'
import { AirShipmentRow } from '@/features/air-shipments/types'

export interface ExcludeModalProps {
  open: boolean
  row: AirShipmentRow | null
  alertType: string
  alertTypeLabel: string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}

export function ExcludeModal({
  open,
  row,
  alertType: _alertType,
  alertTypeLabel,
  onConfirm,
  onClose,
}: ExcludeModalProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset reason when modal closes
  useEffect(() => {
    if (!open) {
      setReason('')
    }
  }, [open])

  if (!open || !row) return null

  const toNumber = String(row['to_number'] ?? '')
  const ltNumber = String(row['lt_number'] ?? '')
  const subtitle = [toNumber, ltNumber].filter(Boolean).join(' · ')

  const isConfirmDisabled = loading || reason.trim() === ''

  const handleConfirm = async () => {
    if (isConfirmDisabled) return
    setLoading(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exclude from Alert</DialogTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Read-only Alert Type */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Alert Type</span>
            <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {alertTypeLabel}
            </div>
          </div>

          {/* Reason textarea */}
          <div className="space-y-1.5">
            <label htmlFor="exclude-reason" className="text-sm font-medium text-foreground">
              Evidence / Reason{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id="exclude-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              rows={4}
              placeholder="Describe the reason or provide evidence for excluding this row…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="h-4 w-4" ariaLabel="Submitting" />
                Excluding…
              </>
            ) : (
              'Exclude Row'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
