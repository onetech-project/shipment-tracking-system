'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { AlertCircle } from 'lucide-react';

interface Role { id: string; name: string; }
interface Organization { id: string; name: string; }

interface InvitationFormProps {
  roles: Role[];
  organizations: Organization[];
  isSuperAdmin?: boolean;
  onSubmit: (data: { email: string; name: string; roleId?: string; organizationId?: string }) => Promise<void>;
  onCancel: () => void;
}

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export default function InvitationForm({ roles, organizations, isSuperAdmin = false, onSubmit, onCancel }: InvitationFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) { setError('Email and name are required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        email: email.trim(),
        name: name.trim(),
        roleId: roleId || undefined,
        organizationId: isSuperAdmin && organizationId ? organizationId : undefined,
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to send invitation'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <FormField label="Email" htmlFor="inv-email" required>
        <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </FormField>
      <FormField label="Full Name" htmlFor="inv-name" required>
        <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required />
      </FormField>
      <FormField label="Role (optional)" htmlFor="inv-role">
        <select id="inv-role" className={selectCls} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">— No role assigned —</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </FormField>
      {isSuperAdmin && (
        <FormField label="Organization (Super Admin only)" htmlFor="inv-org">
          <select id="inv-org" className={selectCls} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">— No organization assigned —</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </FormField>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Invitation'}</Button>
      </div>
    </form>
  );
}
