'use client';
import { useState } from 'react';

interface OrgFormProps {
  initial?: { name: string; address?: string };
  onSubmit: (data: { name: string; address?: string }) => Promise<void>;
  onCancel: () => void;
  slug?: string;
}

export default function OrganizationForm({ initial, onSubmit, onCancel, slug }: OrgFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), address: address.trim() || undefined });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem', borderRadius: 4, marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="org-name" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Name *</label>
        <input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box' }}
          required
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="org-address" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Address</label>
        <textarea
          id="org-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box' }}
        />
      </div>

      {slug && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: '#64748b' }}>Slug (auto-generated)</label>
          <input
            value={slug}
            readOnly
            style={{ width: '100%', padding: '.5rem', border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', color: '#64748b', boxSizing: 'border-box' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '.5rem 1.25rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '.5rem 1.25rem', background: '#e2e8f0', color: '#1e293b', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
