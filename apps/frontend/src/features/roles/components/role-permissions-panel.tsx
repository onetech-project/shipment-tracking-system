'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

interface Permission {
  id: string;
  name: string;
}

interface RolePermissionsPanelProps {
  roleId: string;
  currentPermissionIds: string[];
  onSaved: () => void;
  onClose: () => void;
}

export default function RolePermissionsPanel({ roleId, currentPermissionIds, onSaved, onClose }: RolePermissionsPanelProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentPermissionIds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Permission[]>('/permissions?limit=500')
      .then((r) => setAllPermissions(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(`/roles/${roleId}/permissions`, { permissionIds: Array.from(selected) });
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by module (e.g. "read.shipment" → "shipment")
  const grouped = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const module = p.name.split('.')[1] ?? 'other';
    if (!acc[module]) acc[module] = [];
    acc[module].push(p);
    return acc;
  }, {});

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 560, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginTop: 0 }}>Edit Role Permissions</h2>

        {error && <p style={{ color: '#ef4444', fontSize: '.875rem' }}>{error}</p>}

        {loading ? (
          <p>Loading permissions…</p>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([module, perms]) => (
              <div key={module} style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 .5rem', fontWeight: 600, textTransform: 'capitalize', color: '#334155' }}>{module}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.25rem' }}>
                  {perms.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.875rem' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <code style={{ color: '#475569' }}>{p.name}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
          <button onClick={onClose} style={{ padding: '.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : `Save (${selected.size} selected)`}
          </button>
        </div>
      </div>
    </div>
  );
}
