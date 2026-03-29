'use client'
import React, { useState, useCallback } from 'react'
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
import { useEffect } from 'react'

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
        if (!conflictStates[uploadId]) {
          void loadConflictErrors(uploadId)
        }
      } else if (item.status === 'failed' || item.status === 'partial') {
        if (!errorStates[uploadId]) {
          void loadErrors(uploadId)
        }
      } else {
        if (!importItems[uploadId]) {
          void loadImportItems(uploadId)
        }
      }
    },
    [
      expandedId,
      importItems,
      conflictStates,
      errorStates,
      loadImportItems,
      loadConflictErrors,
      loadErrors,
    ]
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
        const decisions = Object.entries(cs.decisions).map(([errorId, action]) => ({
          errorId,
          action,
        }))
        await resolveConflicts(uploadId, { decisions })
        // Refresh the history item status
        const res = await getImportHistory(20)
        setItems(res.items)
        setNextCursor(res.nextCursor)
        // Clear conflict state and collapse
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

  if (loading) return <p>Loading history…</p>

  if (items.length === 0) {
    return (
      <p data-testid="history-empty" style={{ color: '#64748b' }}>
        No uploads yet.
      </p>
    )
  }

  const STATUS_COLORS: Record<string, string> = {
    queued: '#94a3b8',
    processing: '#3b82f6',
    completed: '#22c55e',
    partial: '#f59e0b',
    awaiting_conflict_review: '#f97316',
    failed: '#ef4444',
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              Filename
            </th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              Status
            </th>
            <th
              style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}
            >
              Imported
            </th>
            <th
              style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}
            >
              Failed
            </th>
            <th
              style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}
            >
              Conflicts
            </th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <React.Fragment key={item.uploadId}>
              <tr
                key={item.uploadId}
                data-testid="history-row"
                style={{ cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                onClick={() => handleRowClick(item)}
              >
                <td style={{ padding: '0.5rem' }}>{item.originalFilename}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span
                    style={{
                      background: STATUS_COLORS[item.status] ?? '#94a3b8',
                      color: '#fff',
                      padding: '0.1rem 0.5rem',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                    }}
                  >
                    {item.status}
                  </span>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: '#22c55e' }}>
                  {item.rowsImported}
                </td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'right',
                    color: item.rowsFailed > 0 ? '#ef4444' : undefined,
                  }}
                >
                  {item.rowsFailed}
                </td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'right',
                    color: item.rowsConflicted > 0 ? '#f97316' : undefined,
                  }}
                >
                  {item.rowsConflicted}
                </td>
                <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                  {new Date(item.createdAt).toLocaleString()}
                </td>
              </tr>
              {expandedId === item.uploadId && (
                <tr key={`${item.uploadId}-detail`} style={{ background: '#f8fafc' }}>
                  <td colSpan={6} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      Total detected: {item.totalRowsDetected}
                      {item.completedAt &&
                        ` · Completed: ${new Date(item.completedAt).toLocaleString()}`}
                    </div>
                    {item.errorMessage && (
                      <div
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          padding: '0.5rem 0.75rem',
                          marginBottom: '0.5rem',
                          fontSize: '0.8125rem',
                          color: '#dc2626',
                        }}
                      >
                        <strong>Error:</strong> {item.errorMessage}
                      </div>
                    )}
                    {item.status === 'failed' || item.status === 'partial'
                      ? (() => {
                          const es = errorStates[item.uploadId]
                          if (!es || es.loading) {
                            return (
                              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                Loading errors…
                              </p>
                            )
                          }
                          if (es.errors.length === 0) {
                            return (
                              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                No error details available.
                              </p>
                            )
                          }
                          return (
                            <div>
                              <h4
                                style={{
                                  margin: '0 0 0.5rem',
                                  fontSize: '0.875rem',
                                  color: '#ef4444',
                                }}
                              >
                                {es.errors.length} error{es.errors.length > 1 ? 's' : ''}
                              </h4>
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                <thead>
                                  <tr style={{ background: '#fee2e2' }}>
                                    <th
                                      style={{
                                        padding: '0.375rem 0.5rem',
                                        textAlign: 'left',
                                      }}
                                    >
                                      Row
                                    </th>
                                    <th
                                      style={{
                                        padding: '0.375rem 0.5rem',
                                        textAlign: 'left',
                                      }}
                                    >
                                      Type
                                    </th>
                                    <th
                                      style={{
                                        padding: '0.375rem 0.5rem',
                                        textAlign: 'left',
                                      }}
                                    >
                                      Field
                                    </th>
                                    <th
                                      style={{
                                        padding: '0.375rem 0.5rem',
                                        textAlign: 'left',
                                      }}
                                    >
                                      Message
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {es.errors.map((err) => (
                                    <tr key={err.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                      <td
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          color: '#94a3b8',
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {err.rowNumber}
                                      </td>
                                      <td
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                        }}
                                      >
                                        <span
                                          style={{
                                            background:
                                              err.errorType === 'validation'
                                                ? '#fbbf24'
                                                : err.errorType === 'parse'
                                                  ? '#f87171'
                                                  : '#fb923c',
                                            color: '#fff',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: 3,
                                            fontSize: '0.7rem',
                                          }}
                                        >
                                          {err.errorType}
                                        </span>
                                      </td>
                                      <td
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          color: '#64748b',
                                        }}
                                      >
                                        {err.fieldName ?? '—'}
                                      </td>
                                      <td style={{ padding: '0.375rem 0.5rem' }}>{err.message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        })()
                      : item.status === 'awaiting_conflict_review'
                        ? (() => {
                            const cs = conflictStates[item.uploadId]
                            if (!cs || cs.loading) {
                              return (
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                  Loading conflicts…
                                </p>
                              )
                            }
                            if (cs.errors.length === 0) {
                              return (
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                  No unresolved conflicts found.
                                </p>
                              )
                            }
                            return (
                              <div>
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem' }}>
                                  Resolve {cs.errors.length} conflict
                                  {cs.errors.length > 1 ? 's' : ''}
                                </h4>
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '0.8125rem',
                                  }}
                                >
                                  <thead>
                                    <tr style={{ background: '#fef3c7' }}>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        #
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        Description
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'center',
                                        }}
                                      >
                                        Action
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cs.errors.map((err, idx) => (
                                      <tr
                                        key={err.id}
                                        style={{ borderBottom: '1px solid #e2e8f0' }}
                                      >
                                        <td
                                          style={{
                                            padding: '0.375rem 0.5rem',
                                            color: '#94a3b8',
                                          }}
                                        >
                                          {idx + 1}
                                        </td>
                                        <td style={{ padding: '0.375rem 0.5rem' }}>
                                          {err.message}
                                          {err.fieldName && (
                                            <span
                                              style={{
                                                marginLeft: '0.5rem',
                                                color: '#94a3b8',
                                                fontSize: '0.75rem',
                                              }}
                                            >
                                              ({err.fieldName})
                                            </span>
                                          )}
                                        </td>
                                        <td
                                          style={{
                                            padding: '0.375rem 0.5rem',
                                            textAlign: 'center',
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: 'inline-flex',
                                              gap: '0.25rem',
                                            }}
                                          >
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleDecisionChange(
                                                  item.uploadId,
                                                  err.id,
                                                  'overwrite'
                                                )
                                              }}
                                              style={{
                                                padding: '0.2rem 0.5rem',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: 4,
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                background:
                                                  cs.decisions[err.id] === 'overwrite'
                                                    ? '#f97316'
                                                    : '#fff',
                                                color:
                                                  cs.decisions[err.id] === 'overwrite'
                                                    ? '#fff'
                                                    : '#475569',
                                              }}
                                            >
                                              Overwrite
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleDecisionChange(item.uploadId, err.id, 'skip')
                                              }}
                                              style={{
                                                padding: '0.2rem 0.5rem',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: 4,
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                background:
                                                  cs.decisions[err.id] === 'skip'
                                                    ? '#64748b'
                                                    : '#fff',
                                                color:
                                                  cs.decisions[err.id] === 'skip'
                                                    ? '#fff'
                                                    : '#475569',
                                              }}
                                            >
                                              Skip
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div
                                  style={{
                                    marginTop: '0.75rem',
                                    display: 'flex',
                                    gap: '0.5rem',
                                  }}
                                >
                                  <button
                                    disabled={cs.submitting}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleResolveSubmit(item.uploadId)
                                    }}
                                    style={{
                                      padding: '0.4rem 1rem',
                                      background: '#3b82f6',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: 6,
                                      cursor: cs.submitting ? 'default' : 'pointer',
                                      opacity: cs.submitting ? 0.6 : 1,
                                      fontSize: '0.8125rem',
                                    }}
                                  >
                                    {cs.submitting ? 'Submitting…' : 'Submit Resolutions'}
                                  </button>
                                </div>
                              </div>
                            )
                          })()
                        : (() => {
                            const state = importItems[item.uploadId]
                            if (!state || state.loading) {
                              return (
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                  Loading items…
                                </p>
                              )
                            }
                            if (state.items.length === 0) {
                              return (
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                  No items found.
                                </p>
                              )
                            }
                            return (
                              <div>
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '0.8125rem',
                                  }}
                                >
                                  <thead>
                                    <tr style={{ background: '#e2e8f0' }}>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        #
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        TO Number
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'right',
                                        }}
                                      >
                                        Weight
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        Destination
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        DG Type
                                      </th>
                                      <th
                                        style={{
                                          padding: '0.375rem 0.5rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        TO Type
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {state.items.map((row, idx) => (
                                      <tr
                                        key={row.id}
                                        style={{ borderBottom: '1px solid #e2e8f0' }}
                                      >
                                        <td
                                          style={{
                                            padding: '0.375rem 0.5rem',
                                            color: '#94a3b8',
                                          }}
                                        >
                                          {(state.page - 1) * 20 + idx + 1}
                                        </td>
                                        <td
                                          style={{
                                            padding: '0.375rem 0.5rem',
                                            fontFamily: 'monospace',
                                          }}
                                        >
                                          {row.toNumber}
                                        </td>
                                        <td
                                          style={{
                                            padding: '0.375rem 0.5rem',
                                            textAlign: 'right',
                                          }}
                                        >
                                          {row.weight ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.375rem 0.5rem' }}>
                                          {row.destination ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.375rem 0.5rem' }}>
                                          {row.dgType ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.375rem 0.5rem' }}>
                                          {row.toType ?? '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {state.totalPages > 1 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      marginTop: '0.5rem',
                                    }}
                                  >
                                    <button
                                      disabled={state.page <= 1 || state.loading}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void loadImportItems(item.uploadId, state.page - 1)
                                      }}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 4,
                                        background: 'none',
                                        cursor: state.page <= 1 ? 'default' : 'pointer',
                                        opacity: state.page <= 1 ? 0.4 : 1,
                                      }}
                                    >
                                      ← Prev
                                    </button>
                                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                      Page {state.page} of {state.totalPages} ({state.total} items)
                                    </span>
                                    <button
                                      disabled={state.page >= state.totalPages || state.loading}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void loadImportItems(item.uploadId, state.page + 1)
                                      }}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 4,
                                        background: 'none',
                                        cursor:
                                          state.page >= state.totalPages ? 'default' : 'pointer',
                                        opacity: state.page >= state.totalPages ? 0.4 : 1,
                                      }}
                                    >
                                      Next →
                                    </button>
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

      {nextCursor && (
        <button
          onClick={() => loadPage(nextCursor)}
          disabled={loadingMore}
          style={{
            marginTop: '1rem',
            background: 'none',
            border: '1px solid #cbd5e1',
            padding: '0.4rem 1rem',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#475569',
          }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
