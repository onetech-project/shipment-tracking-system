'use client';
import { useState } from 'react';

interface InactivateUserDialogProps {
  user: { id: string; username: string };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function InactivateUserDialog({ user, onConfirm, onClose }: InactivateUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to inactivate user');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 420, width: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginTop: 0, color: '#dc2626' }}>Inactivate User</h2>
        <p>Are you sure you want to inactivate <strong>{user.username}</strong>?</p>
        <p style={{ color: '#64748b', fontSize: '.875rem' }}>
          The user will be signed out immediately and will not be able to log in until reactivated.
        </p>
        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem', borderRadius: 4, marginBottom: '1rem', fontSize: '.875rem' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={loading} style={{ padding: '.5rem 1.25rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading} style={{ padding: '.5rem 1.25rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Processing…' : 'Inactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}
