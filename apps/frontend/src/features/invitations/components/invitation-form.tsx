'use client';
import { useState } from 'react';

interface Role {
  id: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
}

interface InvitationFormProps {
  roles: Role[];
  organizations: Organization[];
  isSuperAdmin?: boolean;
  onSubmit: (data: { email: string; name: string; roleId?: string; organizationId?: string }) => Promise<void>;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box', fontSize: '.875rem',
};
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '.875rem' };
const fieldStyle: React.CSSProperties = { marginBottom: '1rem' };

export default function InvitationForm({ roles, organizations, isSuperAdmin = false, onSubmit, onCancel }: InvitationFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) { setError('Email and name are required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        email: email.trim(),
        name: name.trim(),
        roleId: roleId || undefined,
        organizationId: isSuperAdmin && organizationId ? organizationId : undefined,
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to send invitation'));
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
        <label style={labelStyle}>Email *</label>
        <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Full Name *</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Role (optional)</label>
        <select style={inputStyle} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">— No role assigned —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {isSuperAdmin && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Organization (Super Admin only)</label>
          <select style={inputStyle} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">— No organization assigned —</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ padding: '.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Sending…' : 'Send Invitation'}
        </button>
      </div>
    </form>
  );
}
