'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { Banner } from '@/components/shared/banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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
      {error && <Banner tone="danger">Error: {error}</Banner>}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* The header stays even when empty: e2e/audit asserts the Timestamp column on a fresh DB. */}
          <TableWrap>
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Actor ID</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <EmptyState title="No audit logs found." className="rounded-none border-0" />
                      </td>
                    </tr>
                  )}
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="tabular whitespace-nowrap text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{log.action}</code>
                      </TableCell>
                      <TableCell>
                        {log.resourceType
                          ? <span><strong>{log.resourceType}</strong>{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}...` : ''}</span>
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.actorId ? log.actorId.slice(0, 8) + '...' : '—'}</TableCell>
                      <TableCell className="text-xs">{log.ipAddress ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>

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
