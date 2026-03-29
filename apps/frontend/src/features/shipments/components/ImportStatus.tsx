'use client';
import type { ImportStatusResponse } from '@shared/shipments';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusVariant } from '@/components/shared/status-badge';

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

const STATUS_VARIANT: Record<string, StatusVariant> = {
  queued: 'pending',
  processing: 'pending',
  completed: 'success',
  partial: 'inactive',
  awaiting_conflict_review: 'pending',
  failed: 'error',
};

export default function ImportStatus({ status }: ImportStatusProps) {
  const label = STATUS_LABELS[status.status] ?? status.status;
  const variant = STATUS_VARIANT[status.status] ?? 'inactive';

  return (
    <div className="mt-6">
      <div data-testid="import-status" className="mb-4">
        <StatusBadge variant={variant} label={label} />
      </div>

      <div className="rounded-md border overflow-hidden max-w-sm">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-2 text-muted-foreground">Total detected</td>
              <td className="px-4 py-2">{status.totalRowsDetected}</td>
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2 text-muted-foreground">Imported</td>
              <td data-testid="rows-imported" className="px-4 py-2 text-green-600 font-medium">{status.rowsImported}</td>
            </tr>
            {status.rowsFailed > 0 && (
              <tr className="border-b">
                <td className="px-4 py-2 text-muted-foreground">Failed</td>
                <td className="px-4 py-2 text-destructive font-medium">{status.rowsFailed}</td>
              </tr>
            )}
            {status.rowsConflicted > 0 && (
              <tr className="border-b">
                <td className="px-4 py-2 text-muted-foreground">Conflicts</td>
                <td className="px-4 py-2 text-orange-600 font-medium">{status.rowsConflicted}</td>
              </tr>
            )}
            {status.durationMs !== null && (
              <tr>
                <td className="px-4 py-2 text-muted-foreground">Duration</td>
                <td className="px-4 py-2">{(status.durationMs / 1000).toFixed(1)}s</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
