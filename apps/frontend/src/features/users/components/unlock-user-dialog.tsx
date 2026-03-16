'use client';
import { useState } from 'react';

interface UnlockUserDialogProps {
  user: { id: string; username: string };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function UnlockUserDialog({ user, onConfirm, onClose }: UnlockUserDialogProps) {
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
      setError(msg ?? 'Failed to unlock user');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 420, width: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginTop: 0, color: '#16a34a' }}>Unlock User</h2>
        <p>Unlock account for <strong>{user.username}</strong>?</p>
        <p style={{ color: '#64748b', fontSize: '.875rem' }}>
          This will reset the failed login counter and allow the user to sign in again.
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
          <button onClick={handleConfirm} disabled={loading} style={{ padding: '.5rem 1.25rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
