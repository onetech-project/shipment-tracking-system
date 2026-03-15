'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface Role { id: string; name: string; description: string; isSystem: boolean; createdAt: string; }

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get<Role[]>('/roles')
      .then((r) => setRoles(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.post('/roles', form);
      setShowModal(false);
      setForm({ name: '', description: '' });
      load();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to create role');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Roles</h1>
        <button onClick={() => setShowModal(true)} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          + New Role
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Description</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>System</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{r.name}</td>
              <td style={{ padding: '.5rem' }}>{r.description ?? '—'}</td>
              <td style={{ padding: '.5rem' }}>{r.isSystem ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '8px', padding: '1.5rem', minWidth: '360px' }}>
            <h2 style={{ marginTop: 0 }}>New Role</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Description <small>(optional)</small></label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setForm({ name: '', description: '' }); }}
                  style={{ padding: '.4rem .9rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  style={{ padding: '.4rem .9rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
