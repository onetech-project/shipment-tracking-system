'use client';
import { useState } from 'react';
import type { ImportErrorRow, ConflictDecision } from '@shared/shipments';

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
    <div data-testid="conflict-review" style={{ marginTop: '1.5rem' }}>
      <h3 style={{ color: '#f97316' }}>Duplicate Shipments — Review Required</h3>
      <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
        The following shipment IDs already exist. Choose to overwrite the existing record or skip the incoming row.
      </p>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '1rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Row</th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Shipment ID</th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Origin → Dest</th>
            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {duplicates.map((error) => (
            <tr key={error.id} data-testid="conflict-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.5rem' }}>{error.rowNumber}</td>
              <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                {(error.incomingPayload as any)?.shipmentId ?? '—'}
              </td>
              <td style={{ padding: '0.5rem' }}>
                {(error.incomingPayload as any)?.origin} → {(error.incomingPayload as any)?.destination}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <label style={{ marginRight: '1rem', cursor: 'pointer' }}>
                  <input
                    data-testid="conflict-action-overwrite"
                    type="radio"
                    name={`action-${error.id}`}
                    value="overwrite"
                    checked={decisions[error.id] === 'overwrite'}
                    onChange={() => handleAction(error.id, 'overwrite')}
                  />
                  {' '}Overwrite
                </label>
                <label style={{ cursor: 'pointer' }}>
                  <input
                    data-testid="conflict-action-skip"
                    type="radio"
                    name={`action-${error.id}`}
                    value="skip"
                    checked={decisions[error.id] === 'skip'}
                    onChange={() => handleAction(error.id, 'skip')}
                  />
                  {' '}Skip
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        data-testid="resolve-conflicts-submit"
        disabled={!allDecided || submitting}
        onClick={handleSubmit}
        style={{
          background: allDecided && !submitting ? '#3b82f6' : '#94a3b8',
          color: '#fff',
          border: 'none',
          padding: '0.5rem 1.5rem',
          borderRadius: 6,
          cursor: allDecided && !submitting ? 'pointer' : 'default',
        }}
      >
        {submitting ? 'Resolving…' : 'Apply Decisions'}
      </button>
    </div>
  );
}
