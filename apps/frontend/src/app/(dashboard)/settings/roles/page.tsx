'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import RolePermissionsPanel from '@/features/roles/components/role-permissions-panel';

interface RolePermission {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
  isSystem?: boolean;
  permissions: RolePermission[];
  createdAt: string;
}

type Modal =
  | { type: 'create' }
  | { type: 'edit-perms'; role: Role }
  | null;

const btnPrimary: React.CSSProperties = { padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { padding: '.25rem .75rem', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '.8rem' };
const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.5rem', border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box' };

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient
      .get<Role[]>('/roles')
      .then((r) => setRoles(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.post('/roles', { name: newRoleName.trim() });
      setNewRoleName('');
      setModal(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/roles/${id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to delete role');
    }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Roles</h1>
        <button style={btnPrimary} onClick={() => setModal({ type: 'create' })}>+ New Role</button>
      </div>

      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Permissions</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Created</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td style={tdStyle}><code>{role.name}</code></td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem' }}>
                  {role.permissions && role.permissions.slice(0, 5).map((p) => (
                    <span key={p.id} style={{ background: '#dbeafe', color: '#1d4ed8', padding: '.1rem .4rem', borderRadius: 3, fontSize: '.75rem' }}>{p.name}</span>
                  ))}
                  {role.permissions && role.permissions.length > 5 && (
                    <span style={{ color: '#64748b', fontSize: '.75rem' }}>+{role.permissions.length - 5} more</span>
                  )}
                  {role.permissions && role.permissions.length === 0 && <span style={{ color: '#94a3b8', fontSize: '.75rem' }}>None</span>}
                </div>
              </td>
              <td style={tdStyle}>
                {role.isSystem
                  ? <span style={{ color: '#7c3aed', fontWeight: 500, fontSize: '.8rem' }}>System</span>
                  : <span style={{ color: '#64748b', fontSize: '.8rem' }}>Custom</span>}
              </td>
              <td style={tdStyle}>{new Date(role.createdAt).toLocaleDateString()}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '.25rem' }}>
                  <button style={{ ...btnSmall, background: '#e2e8f0' }} onClick={() => setModal({ type: 'edit-perms', role })}>
                    Permissions
                  </button>
                  {!role.isSystem && (
                    <button style={{ ...btnSmall, background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDelete(role.id, role.name)}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {roles.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No roles found.</td></tr>
          )}
        </tbody>
      </table>

      {/* Create Role Modal */}
      {modal?.type === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 420, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>New Role</h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '.875rem' }}>Role Name *</label>
                <input
                  style={inputStyle}
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. warehouse-supervisor"
                  pattern="^[a-z0-9\-_]+$"
                  title="Lowercase letters, numbers, hyphens and underscores only"
                  required
                />
                <p style={{ color: '#64748b', fontSize: '.75rem', marginTop: 4 }}>Lowercase letters, numbers, hyphens and underscores only.</p>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setModal(null)} style={{ padding: '.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating…' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Panel */}
      {modal?.type === 'edit-perms' && (
        <RolePermissionsPanel
          roleId={modal.role.id}
          currentPermissionIds={modal.role?.permissions && modal.role.permissions.map((p) => p.id)}
          onSaved={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
