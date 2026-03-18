'use client';
import type { ImportStatusResponse } from '@shared/shipments';

interface ImportStatusProps {
  status: ImportStatusResponse;
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing…',
  completed: 'Completed',
  partial: 'Partial Success',
  awaiting_conflict_review: 'Action Required — Duplicate Review',
  failed: 'Failed',
};

const STATUS_COLORS: Record<string, string> = {
  queued: '#94a3b8',
  processing: '#3b82f6',
  completed: '#22c55e',
  partial: '#f59e0b',
  awaiting_conflict_review: '#f97316',
  failed: '#ef4444',
};

export default function ImportStatus({ status }: ImportStatusProps) {
  const color = STATUS_COLORS[status.status] ?? '#94a3b8';
  const label = STATUS_LABELS[status.status] ?? status.status;
  const isActive = status.status === 'queued' || status.status === 'processing';

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div
        data-testid="import-status"
        style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          borderRadius: 4,
          background: color,
          color: '#fff',
          fontWeight: 600,
          marginBottom: '1rem',
        }}
      >
        {isActive && <span style={{ marginRight: 6 }}>⏳</span>}
        {label}
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 400 }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>Total detected</td>
            <td style={{ padding: '0.25rem 0.5rem' }}>{status.totalRowsDetected}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>Imported</td>
            <td data-testid="rows-imported" style={{ padding: '0.25rem 0.5rem', color: '#22c55e' }}>
              {status.rowsImported}
            </td>
          </tr>
          {status.rowsFailed > 0 && (
            <tr>
              <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>Failed</td>
              <td style={{ padding: '0.25rem 0.5rem', color: '#ef4444' }}>{status.rowsFailed}</td>
            </tr>
          )}
          {status.rowsConflicted > 0 && (
            <tr>
              <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>Conflicts</td>
              <td style={{ padding: '0.25rem 0.5rem', color: '#f97316' }}>{status.rowsConflicted}</td>
            </tr>
          )}
          {status.durationMs !== null && (
            <tr>
              <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>Duration</td>
              <td style={{ padding: '0.25rem 0.5rem' }}>{(status.durationMs / 1000).toFixed(1)}s</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
