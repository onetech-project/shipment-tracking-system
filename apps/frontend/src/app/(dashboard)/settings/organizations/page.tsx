'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import OrganizationForm from '@/features/organizations/components/organization-form';
import DeactivateOrgDialog from '@/features/organizations/components/deactivate-org-dialog';

interface Organization {
  id: string;
  name: string;
  slug: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
}

type Modal =
  | { type: 'create' }
  | { type: 'edit'; org: Organization }
  | { type: 'deactivate'; org: Organization }
  | null;

const btnPrimary: React.CSSProperties = { padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { padding: '.25rem .75rem', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '.8rem' };
const thStyle: React.CSSProperties = { padding: '.6rem .75rem', textAlign: 'left', background: '#f1f5f9', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '.6rem .75rem', borderBottom: '1px solid #e2e8f0' };

export default function OrganizationsSettingsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = () => {
    setLoading(true);
    apiClient
      .get<Organization[]>('/organizations')
      .then((r) => setOrgs(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (values: { name: string; address?: string }) => {
    await apiClient.post('/organizations', values);
    setModal(null);
    load();
  };

  const handleEdit = async (org: Organization, values: { name: string; address?: string }) => {
    await apiClient.patch(`/organizations/${org.id}`, values);
    setModal(null);
    load();
  };

  const handleDeactivate = async (org: Organization) => {
    await apiClient.patch(`/organizations/${org.id}/deactivate`);
    load();
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Organizations</h1>
        <button style={btnPrimary} onClick={() => setModal({ type: 'create' })}>+ New Organization</button>
      </div>

      {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Slug</th>
            <th style={thStyle}>Address</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Created</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id}>
              <td style={tdStyle}>{org.name}</td>
              <td style={tdStyle}><code style={{ fontSize: '.8rem', color: '#64748b' }}>{org.slug}</code></td>
              <td style={tdStyle}>{org.address ?? '—'}</td>
              <td style={tdStyle}>
                <span style={{ color: org.isActive ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                  {org.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={tdStyle}>{new Date(org.createdAt).toLocaleDateString()}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '.25rem' }}>
                  <button style={{ ...btnSmall, background: '#e2e8f0' }} onClick={() => setModal({ type: 'edit', org })}>Edit</button>
                  {org.isActive && (
                    <button style={{ ...btnSmall, background: '#fee2e2', color: '#dc2626' }} onClick={() => setModal({ type: 'deactivate', org })}>
                      Deactivate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {orgs.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No organizations found.</td></tr>
          )}
        </tbody>
      </table>

      {/* Create Modal */}
      {modal?.type === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 480, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>New Organization</h2>
            <OrganizationForm onSubmit={handleCreate} onCancel={() => setModal(null)} />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modal?.type === 'edit' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 480, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>Edit Organization</h2>
            <OrganizationForm
              initial={{ name: modal.org.name, address: modal.org.address }}
              onSubmit={(values) => handleEdit(modal.org, values)}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      )}

      {/* Deactivate Dialog */}
      {modal?.type === 'deactivate' && (
        <DeactivateOrgDialog
          org={modal.org}
          onConfirm={() => handleDeactivate(modal.org)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
