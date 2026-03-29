'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Organization { id: string; name: string; slug: string; isActive: boolean; createdAt: string; }

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get<Organization[]>('/organizations')
      .then((r) => setOrgs(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.post('/organizations', form);
      setShowModal(false);
      setForm({ name: '', slug: '' });
      load();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to create organization');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader title="Organizations" action={<Button onClick={() => setShowModal(true)}>+ New Organization</Button>} />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">{o.name}</td>
                <td className="px-4 py-3"><code className="text-xs">{o.slug}</code></td>
                <td className="px-4 py-3"><StatusBadge variant={o.isActive ? 'active' : 'inactive'} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Name" htmlFor="no-name" required>
                <Input id="no-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </FormField>
              <FormField label="Slug (lowercase, hyphens only)" htmlFor="no-slug" required>
                <Input id="no-slug" required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowModal(false); setForm({ name: '', slug: '' }); }}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
