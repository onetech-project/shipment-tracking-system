'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import Spinner from '@/components/ui/spinner'

export interface ExcludeByLtModalProps {
  open: boolean
  mode: 'exclude' | 'restore'
  /** Selectable alert types (value + label). The user must pick one. */
  alertTypes: { value: string; label: string }[]
  /** Server-side search for LT numbers matching the query (empty query = recent/first page). */
  searchLtNumbers: (query: string) => Promise<string[]>
  /** Pre-selected alert type when the modal opens (e.g. the active filter); still editable. */
  defaultAlertType?: string
  /** Receives the parsed LT numbers, the chosen alert type, and (for exclude) the reason. */
  onConfirm: (ltNumbers: string[], alertType: string, reason: string) => Promise<void>
  onClose: () => void
}

const CHIP_LIMIT = 5

export function ExcludeByLtModal({
  open,
  mode,
  alertTypes,
  searchLtNumbers,
  defaultAlertType,
  onConfirm,
  onClose,
}: ExcludeByLtModalProps) {
  const [ltNumbers, setLtNumbers] = useState<string[]>([])
  const [ltDropdownOpen, setLtDropdownOpen] = useState(false)
  const [ltSearch, setLtSearch] = useState('')
  const [ltOptions, setLtOptions] = useState<string[]>([])
  const [ltOptionsLoading, setLtOptionsLoading] = useState(false)
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [alertType, setAlertType] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const ltDropdownRef = useRef<HTMLDivElement>(null)

  // Reset the form each time the modal opens, pre-selecting the active filter's alert type.
  useEffect(() => {
    if (open) {
      setLtNumbers([])
      setLtDropdownOpen(false)
      setLtSearch('')
      setLtOptions([])
      setChipsExpanded(false)
      setAlertType(defaultAlertType ?? '')
      setReason('')
    }
  }, [open, defaultAlertType])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ltDropdownRef.current && !ltDropdownRef.current.contains(event.target as Node)) {
        setLtDropdownOpen(false)
      }
    }
    if (ltDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    else document.removeEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ltDropdownOpen])

  // Debounced server-side search as the user types in the LT number dropdown.
  useEffect(() => {
    if (!ltDropdownOpen) return
    let cancelled = false
    setLtOptionsLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchLtNumbers(ltSearch.trim())
        if (!cancelled) setLtOptions(results)
      } finally {
        if (!cancelled) setLtOptionsLoading(false)
      }
    }, 1000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ltDropdownOpen, ltSearch, searchLtNumbers])

  if (!open) return null

  const isExclude = mode === 'exclude'
  const isConfirmDisabled =
    loading || ltNumbers.length === 0 || alertType === '' || (isExclude && reason.trim() === '')

  const ltNumberSet = new Set(ltNumbers)
  // Always surface currently-selected numbers at the top, even if they fall outside the search results.
  const filteredLtOptions = Array.from(new Set([...ltNumbers, ...ltOptions]))

  const toggleLtNumber = (lt: string) => {
    setLtNumbers((prev) => (prev.includes(lt) ? prev.filter((v) => v !== lt) : [...prev, lt]))
  }

  const removeLtNumber = (lt: string) => {
    setLtNumbers((prev) => prev.filter((v) => v !== lt))
  }

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
              ? 'Hides matching shipments from every alert. Select one or more LT numbers.'
              : 'Restores matching shipments that were excluded by LT number. Select one or more LT numbers.'}
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
            <label className="text-sm font-medium text-foreground">
              LT Number(s){' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>

            <div className="relative" ref={ltDropdownRef}>
              <button
                type="button"
                onClick={() => setLtDropdownOpen((o) => !o)}
                disabled={loading}
                aria-haspopup="true"
                aria-expanded={ltDropdownOpen}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <span className="truncate text-left text-muted-foreground">
                  {ltNumbers.length === 0
                    ? 'Select LT number(s)…'
                    : `${ltNumbers.length} selected`}
                </span>
                <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
              </button>

              {ltDropdownOpen && (
                <div
                  className="absolute top-full z-[100] mt-2 max-h-80 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/10"
                  style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18)' }}
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2">
                    <span className="text-xs font-semibold text-muted-foreground">LT Numbers</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setLtNumbers((prev) => Array.from(new Set([...prev, ...filteredLtOptions])))
                        }
                        className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLtNumbers((prev) => prev.filter((lt) => !filteredLtOptions.includes(lt)))
                        }
                        className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div className="border-b border-border px-2 py-2">
                    <input
                      autoFocus
                      value={ltSearch}
                      onChange={(e) => setLtSearch(e.target.value)}
                      placeholder="Search LT numbers…"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div className="max-h-52 overflow-auto px-2 py-1">
                    {ltOptionsLoading ? (
                      <p className="flex items-center justify-center gap-2 px-2 py-3 text-center text-xs text-muted-foreground">
                        <Spinner size="h-3 w-3" ariaLabel="Loading" />
                        Loading…
                      </p>
                    ) : filteredLtOptions.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No LT numbers found
                      </p>
                    ) : (
                      filteredLtOptions.map((lt) => (
                        <label
                          key={lt}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs transition-colors hover:bg-accent/30"
                        >
                          <input
                            type="checkbox"
                            checked={ltNumberSet.has(lt)}
                            onChange={() => toggleLtNumber(lt)}
                            className="h-3 w-3 rounded border border-border accent-accent focus:ring-1 focus:ring-accent"
                          />
                          <span className="truncate" title={lt}>
                            {lt}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {ltNumbers.length > 0 && (
              <div
                className={`flex flex-wrap gap-1.5 pt-1 ${
                  chipsExpanded ? 'max-h-40 overflow-y-auto' : ''
                }`}
              >
                {(chipsExpanded ? ltNumbers : ltNumbers.slice(0, CHIP_LIMIT)).map((lt) => (
                  <Badge key={lt} variant="secondary" className="gap-1 pr-1">
                    {lt}
                    <button
                      type="button"
                      onClick={() => removeLtNumber(lt)}
                      disabled={loading}
                      aria-label={`Remove ${lt}`}
                      className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
                {!chipsExpanded && ltNumbers.length > CHIP_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setChipsExpanded(true)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
                  >
                    {ltNumbers.length - CHIP_LIMIT}+ more
                  </button>
                )}
                {chipsExpanded && ltNumbers.length > CHIP_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setChipsExpanded(false)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
                  >
                    Show less
                  </button>
                )}
              </div>
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
