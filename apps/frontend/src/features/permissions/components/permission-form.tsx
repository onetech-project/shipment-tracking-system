'use client';
import { useState } from 'react';

interface PermissionFormProps {
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box', fontSize: '.875rem' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '.875rem' };
const fieldStyle: React.CSSProperties = { marginBottom: '1rem' };

const ACTIONS = ['read', 'create', 'update', 'delete'];

export default function PermissionForm({ onSubmit, onCancel }: PermissionFormProps) {
  const [action, setAction] = useState('read');
  const [module, setModule] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const permissionName = module.trim() ? `${action}.${module.trim().toLowerCase().replace(/\s+/g, '_')}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!module.trim()) { setError('Module name is required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: permissionName, description: description.trim() || undefined });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to create permission'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem', borderRadius: 4, marginBottom: '1rem', fontSize: '.875rem' }}>
          {error}
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle}>Action *</label>
        <select style={inputStyle} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Module *</label>
        <input style={inputStyle} value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. shipment" maxLength={100} required />
        <p style={{ color: '#64748b', fontSize: '.75rem', marginTop: 4 }}>
          Preview: <code style={{ background: '#f1f5f9', padding: '0 .3rem' }}>{permissionName || '…'}</code>
        </p>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </div>

      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ padding: '.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Creating…' : 'Create Permission'}
        </button>
      </div>
    </form>
  );
}
