'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { AlertCircle } from 'lucide-react';

interface PermissionFormProps {
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
  onCancel: () => void;
}

const ACTIONS = ['read', 'create', 'update', 'delete'];
const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export default function PermissionForm({ onSubmit, onCancel }: PermissionFormProps) {
  const [action, setAction] = useState('read');
  const [module, setModule] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const permissionName = module.trim() ? `${action}.${module.trim().toLowerCase().replace(/\s+/g, '_')}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!module.trim()) { setError('Module name is required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: permissionName, description: description.trim() || undefined });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to create permission'));
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
      <FormField label="Action" htmlFor="perm-action" required>
        <select id="perm-action" className={selectCls} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FormField>
      <FormField label="Module" htmlFor="perm-module" required hint={permissionName ? `Preview: ${permissionName}` : undefined}>
        <Input
          id="perm-module"
          value={module}
          onChange={(e) => setModule(e.target.value)}
          placeholder="e.g. shipment"
          maxLength={100}
          required
        />
      </FormField>
      <FormField label="Description" htmlFor="perm-desc">
        <Input id="perm-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Permission'}</Button>
      </div>
    </form>
  );
}
