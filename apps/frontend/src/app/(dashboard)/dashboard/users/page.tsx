'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface User { id: string; username: string; isActive: boolean; isLocked: boolean; lastLoginAt: string; createdAt: string; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '', firstName: '', lastName: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get<User[]>('/users')
      .then((r) => setUsers(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, string> = { username: form.username, password: form.password };
      if (form.email) payload.email = form.email;
      if (form.firstName) payload.firstName = form.firstName;
      if (form.lastName) payload.lastName = form.lastName;
      await apiClient.post('/users', payload);
      setShowModal(false);
      setForm({ username: '', password: '', email: '', firstName: '', lastName: '' });
      load();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <button onClick={() => setShowModal(true)} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          + New User
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Username</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Locked</th>
            <th style={{ padding: '.5rem', textAlign: 'left' }}>Last Login</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '.5rem' }}>{u.username}</td>
              <td style={{ padding: '.5rem' }}>{u.isActive ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: '.5rem' }}>{u.isLocked ? 'Locked' : '—'}</td>
              <td style={{ padding: '.5rem' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '8px', padding: '1.5rem', minWidth: '360px' }}>
            <h2 style={{ marginTop: 0 }}>New User</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Username</label>
                <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Password <small>(min 8 chars)</small></label>
                <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Email <small>(optional)</small></label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>First Name <small>(optional)</small></label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '.25rem' }}>Last Name <small>(optional)</small></label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  style={{ width: '100%', padding: '.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setForm({ username: '', password: '', email: '', firstName: '', lastName: '' }); }}
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
