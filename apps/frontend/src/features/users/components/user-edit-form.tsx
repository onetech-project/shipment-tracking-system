'use client';
import { useState } from 'react';

interface UserProfile {
  name?: string;
  position?: string;
  employeeNumber?: string;
  phoneNumber?: string;
}

interface UserEditFormProps {
  initial: { profile?: UserProfile };
  onSubmit: (data: { profile: UserProfile }) => Promise<void>;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box', fontSize: '.875rem' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '.875rem' };
const fieldStyle: React.CSSProperties = { marginBottom: '1rem' };

export default function UserEditForm({ initial, onSubmit, onCancel }: UserEditFormProps) {
  const [profile, setProfile] = useState<UserProfile>({
    name: initial.profile?.name ?? '',
    position: initial.profile?.position ?? '',
    employeeNumber: initial.profile?.employeeNumber ?? '',
    phoneNumber: initial.profile?.phoneNumber ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof UserProfile, value: string) => setProfile((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ profile });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to update user'));
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
        <label style={labelStyle}>Full Name</label>
        <input style={inputStyle} value={profile.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={255} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Position</label>
        <input style={inputStyle} value={profile.position ?? ''} onChange={(e) => set('position', e.target.value)} maxLength={255} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Employee Number</label>
        <input style={inputStyle} value={profile.employeeNumber ?? ''} onChange={(e) => set('employeeNumber', e.target.value)} maxLength={50} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Phone Number</label>
        <input style={inputStyle} value={profile.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} maxLength={50} />
      </div>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ padding: '.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
