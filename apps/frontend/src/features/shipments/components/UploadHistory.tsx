'use client';
import { useState, useCallback } from 'react';
import type { UploadHistoryItem } from '@shared/shipments';
import { getImportHistory } from '../api/shipments.api';
import { useEffect } from 'react';

export default function UploadHistory() {
  const [items, setItems] = useState<UploadHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadPage = useCallback(async (cursor?: string) => {
    const isMore = Boolean(cursor);
    isMore ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await getImportHistory(20, cursor);
      setItems((prev) => isMore ? [...prev, ...res.items] : res.items);
      setNextCursor(res.nextCursor);
    } finally {
      isMore ? setLoadingMore(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPage(); }, [loadPage]);

  if (loading) return <p>Loading history…</p>;

  if (items.length === 0) {
    return <p data-testid="history-empty" style={{ color: '#64748b' }}>No uploads yet.</p>;
  }

  const STATUS_COLORS: Record<string, string> = {
    queued: '#94a3b8',
    processing: '#3b82f6',
    completed: '#22c55e',
    partial: '#f59e0b',
    awaiting_conflict_review: '#f97316',
    failed: '#ef4444',
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Filename</th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Status</th>
            <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Imported</th>
            <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Failed</th>
            <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Conflicts</th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <>
              <tr
                key={item.uploadId}
                data-testid="history-row"
                style={{ cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                onClick={() => setExpandedId(expandedId === item.uploadId ? null : item.uploadId)}
              >
                <td style={{ padding: '0.5rem' }}>{item.originalFilename}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ background: STATUS_COLORS[item.status] ?? '#94a3b8', color: '#fff', padding: '0.1rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}>
                    {item.status}
                  </span>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: '#22c55e' }}>{item.rowsImported}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: item.rowsFailed > 0 ? '#ef4444' : undefined }}>{item.rowsFailed}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: item.rowsConflicted > 0 ? '#f97316' : undefined }}>{item.rowsConflicted}</td>
                <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                  {new Date(item.createdAt).toLocaleString()}
                </td>
              </tr>
              {expandedId === item.uploadId && (
                <tr key={`${item.uploadId}-detail`} style={{ background: '#f8fafc' }}>
                  <td colSpan={6} style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                      Total detected: {item.totalRowsDetected}
                      {item.completedAt && ` · Completed: ${new Date(item.completedAt).toLocaleString()}`}
                    </span>
                  </td>
                </tr>
              )}
            </>
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
  );
}
