'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

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
      <PageHeader
        title="Audit Logs"
        subtitle={`${total} total events`}
      />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm min-w-[700px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Resource</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Actor ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</code>
                    </td>
                    <td className="px-4 py-3">
                      {log.resourceType
                        ? <span><strong>{log.resourceType}</strong>{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}...` : ''}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log.actorId ? log.actorId.slice(0, 8) + '...' : '—'}</td>
                    <td className="px-4 py-3 text-xs">{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
