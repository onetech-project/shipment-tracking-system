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

export interface ExcludeByLtModalProps {
  open: boolean
  mode: 'exclude' | 'restore'
  /** Selectable alert types (value + label). The user must pick one. */
  alertTypes: { value: string; label: string }[]
  /** Pre-selected alert type when the modal opens (e.g. the active filter); still editable. */
  defaultAlertType?: string
  /** Receives the parsed LT numbers, the chosen alert type, and (for exclude) the reason. */
  onConfirm: (ltNumbers: string[], alertType: string, reason: string) => Promise<void>
  onClose: () => void
}

/** Splits a free-text field into distinct LT numbers (newline / comma / whitespace separated). */
function parseLtNumbers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean)
    )
  )
}

export function ExcludeByLtModal({
  open,
  mode,
  alertTypes,
  defaultAlertType,
  onConfirm,
  onClose,
}: ExcludeByLtModalProps) {
  const [ltText, setLtText] = useState('')
  const [alertType, setAlertType] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset the form each time the modal opens, pre-selecting the active filter's alert type.
  useEffect(() => {
    if (open) {
      setLtText('')
      setAlertType(defaultAlertType ?? '')
      setReason('')
    }
  }, [open, defaultAlertType])

  if (!open) return null

  const isExclude = mode === 'exclude'
  const ltNumbers = parseLtNumbers(ltText)
  const isConfirmDisabled =
    loading || ltNumbers.length === 0 || alertType === '' || (isExclude && reason.trim() === '')

  const handleConfirm = async () => {
    if (isConfirmDisabled) return
    setLoading(true)
    try {
      await onConfirm(ltNumbers, alertType, reason.trim())
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
          <DialogTitle>{isExclude ? 'Exclude by LT Number' : 'Restore by LT Number'}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {isExclude
              ? 'Hides matching shipments from every alert. Enter one or more LT numbers (one per line).'
              : 'Restores matching shipments that were excluded by LT number. Enter one or more LT numbers (one per line).'}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="lt-alert-type" className="text-sm font-medium text-foreground">
              Alert Type{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="lt-alert-type"
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="" disabled>
                Select alert type…
              </option>
              {alertTypes.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lt-numbers" className="text-sm font-medium text-foreground">
              LT Number(s){' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id="lt-numbers"
              value={ltText}
              onChange={(e) => setLtText(e.target.value)}
              disabled={loading}
              rows={4}
              placeholder={'LT-0001\nLT-0002'}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            {ltNumbers.length > 0 && (
              <p className="text-xs text-muted-foreground">{ltNumbers.length} LT number(s)</p>
            )}
          </div>

          {isExclude && (
            <div className="space-y-1.5">
              <label htmlFor="lt-reason" className="text-sm font-medium text-foreground">
                Evidence / Reason{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <textarea
                id="lt-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                rows={3}
                placeholder="Describe the reason or provide evidence…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
          )}
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
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Spinner size="h-4 w-4" ariaLabel="Submitting" />
                {isExclude ? 'Excluding…' : 'Restoring…'}
              </>
            ) : isExclude ? (
              'Exclude'
            ) : (
              'Restore'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
