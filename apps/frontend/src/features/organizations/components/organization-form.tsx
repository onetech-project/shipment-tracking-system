'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { AlertCircle } from 'lucide-react';

interface OrgFormProps {
  initial?: { name: string; address?: string };
  onSubmit: (data: { name: string; address?: string }) => Promise<void>;
  onCancel: () => void;
  slug?: string;
}

export default function OrganizationForm({ initial, onSubmit, onCancel, slug }: OrgFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), address: address.trim() || undefined });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'An error occurred');
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
      <FormField label="Name" htmlFor="org-name" required>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>
      <FormField label="Address" htmlFor="org-address">
        <textarea
          id="org-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </FormField>
      {slug && (
        <FormField label="Slug (auto-generated)" htmlFor="org-slug">
          <Input id="org-slug" value={slug} readOnly className="bg-muted text-muted-foreground" />
        </FormField>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}
