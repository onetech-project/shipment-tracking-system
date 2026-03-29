'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  const grouped = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const module = p.name.split('.')[1] ?? 'other';
    if (!acc[module]) acc[module] = [];
    acc[module].push(p);
    return acc;
  }, {});

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Role Permissions</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex-1 overflow-y-auto border-t pt-4 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading permissions…</p>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([module, perms]) => (
              <div key={module}>
                <p className="mb-2 text-sm font-semibold capitalize text-foreground">{module}</p>
                <div className="grid grid-cols-2 gap-1">
                  {perms.map((p) => (
                    <label key={p.id} className={cn(
                      'flex items-center gap-2 cursor-pointer rounded px-2 py-1 text-xs',
                      'hover:bg-muted motion-safe:transition-colors',
                      selected.has(p.id) && 'bg-primary/10'
                    )}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="accent-primary"
                      />
                      <code className="text-muted-foreground">{p.name}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : `Save (${selected.size} selected)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
