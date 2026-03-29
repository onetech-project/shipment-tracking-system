'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader title="Roles" action={<Button onClick={() => setShowModal(true)}>+ New Role</Button>} />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">System</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.description ?? '—'}</td>
                <td className="px-4 py-3">{r.isSystem ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Role</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Name" htmlFor="nr-name" required>
                <Input id="nr-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </FormField>
              <FormField label="Description (optional)" htmlFor="nr-desc">
                <Input id="nr-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowModal(false); setForm({ name: '', description: '' }); }}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
