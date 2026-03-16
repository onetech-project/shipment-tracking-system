'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import PermissionForm from '@/features/permissions/components/permission-form';
import { usePermissions } from '@/shared/hooks/use-permissions';

interface Permission {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

const btnPrimary: React.CSSProperties = { padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0' };

export default function PermissionsSettingsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('');
  const { isSuperAdmin } = usePermissions();

  const load = () => {
    setLoading(true);
    apiClient
      .get<Permission[]>('/permissions?limit=500')
      .then((r) => setPermissions(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (data: { name: string; description?: string }) => {
    await apiClient.post('/permissions', data);
    setShowModal(false);
    load();
  };

  const filtered = filter
    ? permissions.filter((p) => p.name.includes(filter.toLowerCase()))
    : permissions;

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Permissions</h1>
        {isSuperAdmin && (
          <button style={btnPrimary} onClick={() => setShowModal(true)}>+ New Permission</button>
        )}
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      <div style={{ marginBottom: '1rem' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
          style={{ padding: '.4rem .75rem', border: '1px solid #d1d5db', borderRadius: 4, width: 260 }}
        />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}><code style={{ background: '#f1f5f9', padding: '.1rem .4rem', borderRadius: 3, fontSize: '.875rem' }}>{p.name}</code></td>
              <td style={tdStyle}>{p.description ?? '—'}</td>
              <td style={tdStyle}>{new Date(p.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No permissions found.</td></tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 460, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>New Permission</h2>
            <PermissionForm onSubmit={handleCreate} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
