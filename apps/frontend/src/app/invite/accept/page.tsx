'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient } from '@/shared/api/client';

function AcceptContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid invitation link');
      return;
    }
    apiClient.post(`/invitations/accept?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus('success');
        setMessage('Invitation accepted! You can now log in.');
        setTimeout(() => router.replace('/login'), 3000);
      })
      .catch((e) => {
        setStatus('error');
        setMessage(e.response?.data?.message ?? 'Invalid or expired invitation');
      });
  }, [token, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        {status === 'loading' && <p>Accepting invitation…</p>}
        {status === 'success' && <p style={{ color: 'green' }}>{message}</p>}
        {status === 'error' && <p style={{ color: 'red' }}>{message}</p>}
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AcceptContent />
    </Suspense>
  );
}
