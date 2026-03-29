'use client';
import { useState } from 'react';
import type { ImportErrorRow, ConflictDecision } from '@shared/shipments';
import { Button } from '@/components/ui/button';

interface ConflictReviewProps {
  errors: ImportErrorRow[];
  onResolve: (decisions: ConflictDecision[]) => Promise<void>;
}

export default function ConflictReview({ errors, onResolve }: ConflictReviewProps) {
  const duplicates = errors.filter((e) => e.errorType === 'duplicate' && !e.resolved);
  const [decisions, setDecisions] = useState<Record<string, 'overwrite' | 'skip'>>({});
  const [submitting, setSubmitting] = useState(false);

  if (duplicates.length === 0) return null;

  const allDecided = duplicates.every((e) => decisions[e.id] !== undefined);

  const handleAction = (errorId: string, action: 'overwrite' | 'skip') => {
    setDecisions((prev) => ({ ...prev, [errorId]: action }));
  };

  const handleSubmit = async () => {
    if (!allDecided) return;
    setSubmitting(true);
    const payload: ConflictDecision[] = duplicates.map((e) => ({
      errorId: e.id,
      action: decisions[e.id],
    }));
    try {
      await onResolve(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="conflict-review" className="mt-6">
      <h3 className="text-lg font-semibold text-orange-600 mb-1">Duplicate Shipments — Review Required</h3>
      <p className="text-sm text-muted-foreground mb-4">
        The following shipment IDs already exist. Choose to overwrite the existing record or skip the incoming row.
      </p>

      <div className="overflow-x-auto rounded-md border mb-4">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Row</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Shipment ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Origin → Dest</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map((error) => (
              <tr key={error.id} data-testid="conflict-row" className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">{error.rowNumber}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {(error.incomingPayload as Record<string, unknown>)?.shipmentId as string ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {(error.incomingPayload as Record<string, unknown>)?.origin as string} → {(error.incomingPayload as Record<string, unknown>)?.destination as string}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        data-testid="conflict-action-overwrite"
                        type="radio"
                        name={`action-${error.id}`}
                        value="overwrite"
                        checked={decisions[error.id] === 'overwrite'}
                        onChange={() => handleAction(error.id, 'overwrite')}
                        className="accent-orange-500"
                      />
                      Overwrite
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        data-testid="conflict-action-skip"
                        type="radio"
                        name={`action-${error.id}`}
                        value="skip"
                        checked={decisions[error.id] === 'skip'}
                        onChange={() => handleAction(error.id, 'skip')}
                        className="accent-primary"
                      />
                      Skip
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        data-testid="resolve-conflicts-submit"
        disabled={!allDecided || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Resolving…' : 'Apply Decisions'}
      </Button>
    </div>
  );
}
