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

export interface EvidenceModalProps {
  open: boolean
  /** AWB whose offload is being justified */
  awb: string | null
  /** Existing evidence link when editing (empty when adding) */
  initialEvidence?: string
  onConfirm: (evidence: string) => Promise<void>
  onClose: () => void
}

/**
 * Captures a link to the (externally-stored) evidence letter for an offloaded AWB.
 * Saving excludes the AWB — and every TO sharing it — from the Flight Tracking alert.
 */
export function EvidenceModal({
  open,
  awb,
  initialEvidence = '',
  onConfirm,
  onClose,
}: EvidenceModalProps) {
  const [evidence, setEvidence] = useState('')
  const [loading, setLoading] = useState(false)

  // Seed with the existing value each time the modal opens; clear on close.
  useEffect(() => {
    if (open) setEvidence(initialEvidence)
    else setEvidence('')
  }, [open, initialEvidence])

  if (!open || !awb) return null

  const isConfirmDisabled = loading || evidence.trim() === ''

  const handleConfirm = async () => {
    if (isConfirmDisabled) return
    setLoading(true)
    try {
      await onConfirm(evidence.trim())
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
          <DialogTitle>Evidence for Offload</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">AWB {awb}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="evidence-link" className="text-sm font-medium text-foreground">
              Evidence link{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="evidence-link"
              type="text"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirm()
              }}
              disabled={loading}
              placeholder="https://… link to the evidence letter"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              The evidence letter is stored outside the system — paste a link to it. Saving removes
              this AWB and all related TOs from the Flight Tracking alert.
            </p>
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
                <Spinner size="h-4 w-4" ariaLabel="Saving" />
                Saving…
              </>
            ) : (
              'Save Evidence'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
