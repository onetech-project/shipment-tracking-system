'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/shared/api/client'

function AcceptInvitationForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'form' | 'submitting' | 'success' | 'error'>('form')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid invitation link')
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setMessage('Passwords do not match')
      return
    }
    setStatus('submitting')
    setMessage('')
    try {
      const res = await apiClient.post('/invitations/accept', { token, username, password })
      setStatus('success')
      setMessage(res.data?.message ?? 'Account created! You can now log in.')
      setTimeout(() => router.replace('/login'), 3000)
    } catch (e: any) {
      setStatus('form')
      setMessage(e.response?.data?.message ?? 'Invalid or expired invitation')
    }
  }

  if (status === 'error') {
    return <p style={{ color: 'red' }}>{message}</p>
  }

  if (status === 'success') {
    return <p style={{ color: 'green' }}>{message}</p>
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 300 }}
    >
      <h2>Create your account</h2>
      {message && <p style={{ color: 'red' }}>{message}</p>}
      <label>
        Username
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </label>
      <button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <AcceptInvitationForm />
        </div>
      </div>
    </Suspense>
  )
}
