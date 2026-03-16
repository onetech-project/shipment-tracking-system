'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface AuditLog {
  id: string;
  action: string;
  organizationId?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0', fontSize: '.875rem' };

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = (p: number) => {
    setLoading(true);
    apiClient
      .get<[AuditLog[], number]>(`/audit?page=${p}&limit=${limit}`)
      .then((r) => {
        const [data, count] = r.data;
        setLogs(data);
        setTotal(count);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Audit Logs</h1>
        <p style={{ color: '#64748b', marginTop: '.5rem', marginBottom: 0 }}>Total: {total} events</p>
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Resource</th>
                  <th style={thStyle}>Actor ID</th>
                  <th style={thStyle}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={tdStyle}>{new Date(log.createdAt).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <code style={{ background: '#f1f5f9', padding: '.1rem .4rem', borderRadius: 3, fontSize: '.75rem' }}>{log.action}</code>
                    </td>
                    <td style={tdStyle}>
                      {log.resourceType
                        ? <span><strong>{log.resourceType}</strong>{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}…` : ''}</span>
                        : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: '#475569' }}>{log.actorId ? log.actorId.slice(0, 8) + '…' : '—'}</td>
                    <td style={tdStyle}>{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No audit logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '.4rem .75rem', border: '1px solid #d1d5db', borderRadius: 4, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
              >
                ← Prev
              </button>
              <span style={{ color: '#64748b', fontSize: '.875rem' }}>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '.4rem .75rem', border: '1px solid #d1d5db', borderRadius: 4, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
