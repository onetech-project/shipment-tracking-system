'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div>
      <PageHeader
        title="Users"
        action={<Button onClick={() => setShowModal(true)}>+ New User</Button>}
      />
      {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Locked</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">
                <td className="px-4 py-3">{u.username}</td>
                <td className="px-4 py-3"><StatusBadge variant={u.isActive ? 'active' : 'inactive'} /></td>
                <td className="px-4 py-3">{u.isLocked ? <StatusBadge variant="locked" /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New User</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Username" htmlFor="nu-username" required>
                <Input id="nu-username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </FormField>
              <FormField label="Password (min 8 chars)" htmlFor="nu-password" required>
                <Input id="nu-password" required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </FormField>
              <FormField label="Email (optional)" htmlFor="nu-email">
                <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </FormField>
              <FormField label="First Name (optional)" htmlFor="nu-fn">
                <Input id="nu-fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </FormField>
              <FormField label="Last Name (optional)" htmlFor="nu-ln">
                <Input id="nu-ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowModal(false); setForm({ username: '', password: '', email: '', firstName: '', lastName: '' }); }}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
