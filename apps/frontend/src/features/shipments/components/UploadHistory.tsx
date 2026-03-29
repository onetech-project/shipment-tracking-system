'use client'
import React, { useState, useCallback, useEffect } from 'react'
import type {
  UploadHistoryItem,
  LinehaulTripItemResponse,
  ImportErrorRow,
  ConflictAction,
} from '@shared/shipments'
import {
  getImportHistory,
  getImportItems,
  getImportErrors,
  resolveConflicts,
} from '../api/shipments.api'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import type { StatusVariant } from '@/components/shared/status-badge'
import { cn } from '@/lib/utils'

interface ImportItemsState {
  items: LinehaulTripItemResponse[]
  total: number
  page: number
  totalPages: number
  loading: boolean
}

interface ConflictState {
  errors: ImportErrorRow[]
  decisions: Record<string, ConflictAction>
  loading: boolean
  submitting: boolean
}

const STATUS_VARIANT: Record<string, StatusVariant> = {
  queued: 'pending',
  processing: 'pending',
  completed: 'success',
  partial: 'inactive',
  awaiting_conflict_review: 'pending',
  failed: 'error',
}

export default function UploadHistory() {
  const [items, setItems] = useState<UploadHistoryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importItems, setImportItems] = useState<Record<string, ImportItemsState>>({})
  const [conflictStates, setConflictStates] = useState<Record<string, ConflictState>>({})
  const [errorStates, setErrorStates] = useState<
    Record<string, { errors: ImportErrorRow[]; loading: boolean }>
  >({})

  const loadPage = useCallback(async (cursor?: string) => {
    const isMore = Boolean(cursor)
    isMore ? setLoadingMore(true) : setLoading(true)
    try {
      const res = await getImportHistory(20, cursor)
      setItems((prev) => (isMore ? [...prev, ...res.items] : res.items))
      setNextCursor(res.nextCursor)
    } finally {
      isMore ? setLoadingMore(false) : setLoading(false)
    }
  }, [])

  const loadConflictErrors = useCallback(async (uploadId: string) => {
    setConflictStates((prev) => ({
      ...prev,
      [uploadId]: { errors: [], decisions: {}, loading: true, submitting: false },
    }))
    try {
      const res = await getImportErrors(uploadId)
      const unresolvedDuplicates = res.items.filter(
        (e) => e.errorType === 'duplicate' && !e.resolved
      )
      const defaultDecisions: Record<string, ConflictAction> = {}
      for (const e of unresolvedDuplicates) {
        defaultDecisions[e.id] = 'skip'
      }
      setConflictStates((prev) => ({
        ...prev,
        [uploadId]: {
          errors: unresolvedDuplicates,
          decisions: defaultDecisions,
          loading: false,
          submitting: false,
        },
      }))
    } catch {
      setConflictStates((prev) => ({
        ...prev,
        [uploadId]: { errors: [], decisions: {}, loading: false, submitting: false },
      }))
    }
  }, [])

  const loadErrors = useCallback(async (uploadId: string) => {
    setErrorStates((prev) => ({ ...prev, [uploadId]: { errors: [], loading: true } }))
    try {
      const res = await getImportErrors(uploadId)
      setErrorStates((prev) => ({ ...prev, [uploadId]: { errors: res.items, loading: false } }))
    } catch {
      setErrorStates((prev) => ({ ...prev, [uploadId]: { errors: [], loading: false } }))
    }
  }, [])

  const loadImportItems = useCallback(async (uploadId: string, page = 1) => {
    setImportItems((prev) => ({
      ...prev,
      [uploadId]: {
        ...prev[uploadId],
        items: prev[uploadId]?.items ?? [],
        total: prev[uploadId]?.total ?? 0,
        page,
        totalPages: prev[uploadId]?.totalPages ?? 0,
        loading: true,
      },
    }))
    try {
      const res = await getImportItems(uploadId, page, 20)
      setImportItems((prev) => ({
        ...prev,
        [uploadId]: {
          items: res.items,
          total: res.total,
          page: res.page,
          totalPages: res.totalPages,
          loading: false,
        },
      }))
    } catch {
      setImportItems((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          items: prev[uploadId]?.items ?? [],
          total: 0,
          page,
          totalPages: 0,
          loading: false,
        },
      }))
    }
  }, [])

  const handleRowClick = useCallback(
    (item: UploadHistoryItem) => {
      const uploadId = item.uploadId
      if (expandedId === uploadId) {
        setExpandedId(null)
        return
      }
      setExpandedId(uploadId)
      if (item.status === 'awaiting_conflict_review') {
        if (!conflictStates[uploadId]) void loadConflictErrors(uploadId)
      } else if (item.status === 'failed' || item.status === 'partial') {
        if (!errorStates[uploadId]) void loadErrors(uploadId)
      } else {
        if (!importItems[uploadId]) void loadImportItems(uploadId)
      }
    },
    [expandedId, importItems, conflictStates, errorStates, loadImportItems, loadConflictErrors, loadErrors]
  )

  const handleDecisionChange = useCallback(
    (uploadId: string, errorId: string, action: ConflictAction) => {
      setConflictStates((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          decisions: { ...prev[uploadId].decisions, [errorId]: action },
        },
      }))
    },
    []
  )

  const handleResolveSubmit = useCallback(
    async (uploadId: string) => {
      const cs = conflictStates[uploadId]
      if (!cs) return
      setConflictStates((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], submitting: true },
      }))
      try {
        const decisions = Object.entries(cs.decisions).map(([errorId, action]) => ({ errorId, action }))
        await resolveConflicts(uploadId, { decisions })
        const res = await getImportHistory(20)
        setItems(res.items)
        setNextCursor(res.nextCursor)
        setConflictStates((prev) => {
          const next = { ...prev }
          delete next[uploadId]
          return next
        })
        setExpandedId(null)
      } catch {
        setConflictStates((prev) => ({
          ...prev,
          [uploadId]: { ...prev[uploadId], submitting: false },
        }))
      }
    },
    [conflictStates]
  )

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (loading) return <p className="text-muted-foreground">Loading history…</p>

  if (items.length === 0) {
    return (
      <p data-testid="history-empty" className="text-muted-foreground">
        No uploads yet.
      </p>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Filename</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Imported</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Failed</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Conflicts</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <React.Fragment key={item.uploadId}>
                <tr
                  data-testid="history-row"
                  className="border-t cursor-pointer hover:bg-muted/30 motion-safe:transition-colors"
                  onClick={() => handleRowClick(item)}
                >
                  <td className="px-4 py-3 max-w-[200px] truncate">{item.originalFilename}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={STATUS_VARIANT[item.status] ?? 'inactive'} label={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{item.rowsImported}</td>
                  <td className={cn('px-4 py-3 text-right', item.rowsFailed > 0 ? 'text-destructive font-medium' : '')}>
                    {item.rowsFailed}
                  </td>
                  <td className={cn('px-4 py-3 text-right', item.rowsConflicted > 0 ? 'text-orange-600 font-medium' : '')}>
                    {item.rowsConflicted}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                </tr>
                {expandedId === item.uploadId && (
                  <tr className="bg-muted/30">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        Total detected: {item.totalRowsDetected}
                        {item.completedAt && ` · Completed: ${new Date(item.completedAt).toLocaleString()}`}
                      </div>
                      {item.errorMessage && (
                        <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          <strong>Error:</strong> {item.errorMessage}
                        </div>
                      )}

                      {/* Failed/partial: show errors */}
                      {(item.status === 'failed' || item.status === 'partial') && (() => {
                        const es = errorStates[item.uploadId]
                        if (!es || es.loading) return <p className="text-xs text-muted-foreground">Loading errors…</p>
                        if (es.errors.length === 0) return <p className="text-xs text-muted-foreground">No error details available.</p>
                        return (
                          <div>
                            <h4 className="mb-2 text-xs font-semibold text-destructive">{es.errors.length} error{es.errors.length > 1 ? 's' : ''}</h4>
                            <div className="overflow-x-auto rounded border">
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-red-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left">Row</th>
                                    <th className="px-3 py-2 text-left">Type</th>
                                    <th className="px-3 py-2 text-left">Field</th>
                                    <th className="px-3 py-2 text-left">Message</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {es.errors.map((err) => (
                                    <tr key={err.id} className="border-t">
                                      <td className="px-3 py-2 font-mono text-muted-foreground">{err.rowNumber}</td>
                                      <td className="px-3 py-2">
                                        <span className={cn('rounded px-1 py-0.5 text-white text-xs',
                                          err.errorType === 'validation' ? 'bg-amber-400' :
                                          err.errorType === 'parse' ? 'bg-red-400' : 'bg-orange-400'
                                        )}>
                                          {err.errorType}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{err.fieldName ?? '—'}</td>
                                      <td className="px-3 py-2">{err.message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Conflict review */}
                      {item.status === 'awaiting_conflict_review' && (() => {
                        const cs = conflictStates[item.uploadId]
                        if (!cs || cs.loading) return <p className="text-xs text-muted-foreground">Loading conflicts…</p>
                        if (cs.errors.length === 0) return <p className="text-xs text-muted-foreground">No unresolved conflicts found.</p>
                        return (
                          <div>
                            <h4 className="mb-2 text-xs font-semibold">
                              Resolve {cs.errors.length} conflict{cs.errors.length > 1 ? 's' : ''}
                            </h4>
                            <div className="overflow-x-auto rounded border mb-3">
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-amber-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left">#</th>
                                    <th className="px-3 py-2 text-left">Description</th>
                                    <th className="px-3 py-2 text-center">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cs.errors.map((err, idx) => (
                                    <tr key={err.id} className="border-t">
                                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                                      <td className="px-3 py-2">
                                        {err.message}
                                        {err.fieldName && <span className="ml-2 text-muted-foreground">({err.fieldName})</span>}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <div className="inline-flex gap-1">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDecisionChange(item.uploadId, err.id, 'overwrite') }}
                                            className={cn(
                                              'rounded border px-2 py-0.5 text-xs motion-safe:transition-colors',
                                              cs.decisions[err.id] === 'overwrite'
                                                ? 'border-orange-500 bg-orange-500 text-white'
                                                : 'border-border bg-background text-foreground hover:bg-muted'
                                            )}
                                          >Overwrite</button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDecisionChange(item.uploadId, err.id, 'skip') }}
                                            className={cn(
                                              'rounded border px-2 py-0.5 text-xs motion-safe:transition-colors',
                                              cs.decisions[err.id] === 'skip'
                                                ? 'border-slate-600 bg-slate-600 text-white'
                                                : 'border-border bg-background text-foreground hover:bg-muted'
                                            )}
                                          >Skip</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <Button
                              size="sm"
                              disabled={cs.submitting}
                              onClick={(e) => { e.stopPropagation(); void handleResolveSubmit(item.uploadId) }}
                            >
                              {cs.submitting ? 'Submitting…' : 'Submit Resolutions'}
                            </Button>
                          </div>
                        )
                      })()}

                      {/* Normal items */}
                      {item.status !== 'failed' && item.status !== 'partial' && item.status !== 'awaiting_conflict_review' && (() => {
                        const state = importItems[item.uploadId]
                        if (!state || state.loading) return <p className="text-xs text-muted-foreground">Loading items…</p>
                        if (state.items.length === 0) return <p className="text-xs text-muted-foreground">No items found.</p>
                        return (
                          <div>
                            <div className="overflow-x-auto rounded border">
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-muted">
                                  <tr>
                                    <th className="px-3 py-2 text-left">#</th>
                                    <th className="px-3 py-2 text-left">TO Number</th>
                                    <th className="px-3 py-2 text-right">Weight</th>
                                    <th className="px-3 py-2 text-left">Destination</th>
                                    <th className="px-3 py-2 text-left">DG Type</th>
                                    <th className="px-3 py-2 text-left">TO Type</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {state.items.map((row, idx) => (
                                    <tr key={row.id} className="border-t">
                                      <td className="px-3 py-2 text-muted-foreground">{(state.page - 1) * 20 + idx + 1}</td>
                                      <td className="px-3 py-2 font-mono">{row.toNumber}</td>
                                      <td className="px-3 py-2 text-right">{row.weight ?? '—'}</td>
                                      <td className="px-3 py-2">{row.destination ?? '—'}</td>
                                      <td className="px-3 py-2">{row.dgType ?? '—'}</td>
                                      <td className="px-3 py-2">{row.toType ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {state.totalPages > 1 && (
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={state.page <= 1 || state.loading}
                                  onClick={(e) => { e.stopPropagation(); void loadImportItems(item.uploadId, state.page - 1) }}
                                >
                                  ← Prev
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  Page {state.page} of {state.totalPages} ({state.total} items)
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={state.page >= state.totalPages || state.loading}
                                  onClick={(e) => { e.stopPropagation(); void loadImportItems(item.uploadId, state.page + 1) }}
                                >
                                  Next →
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => loadPage(nextCursor)}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
