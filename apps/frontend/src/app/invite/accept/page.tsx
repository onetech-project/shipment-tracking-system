'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Banner } from '@/components/shared/banner'
import { BrandLogo } from '@/components/shared/brand-logo'

function AcceptInvitationForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params?.get('token')

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
    } catch (e: unknown) {
      setStatus('form')
      setMessage(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Invalid or expired invitation'
      )
    }
  }

  if (status === 'error') {
    return <Banner tone="danger">{message}</Banner>
  }

  if (status === 'success') {
    return <Banner tone="success">{message}</Banner>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="font-display text-xl font-bold">Create your account</h2>
      {message && <Banner tone="danger">{message}</Banner>}
      <FormField label="Username" htmlFor="acc-username" required>
        <Input
          id="acc-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
      </FormField>
      <FormField label="Password" htmlFor="acc-password" required>
        <Input
          id="acc-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </FormField>
      <FormField label="Confirm password" htmlFor="acc-confirm" required>
        <Input
          id="acc-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </FormField>
      <Button type="submit" disabled={status === 'submitting'} className="w-full">
        {status === 'submitting' ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-soft-md">
          <CardHeader className="items-center text-center">
            <BrandLogo size="md" className="mb-2" />
            <CardTitle className="text-2xl">Join Shipment Tracker</CardTitle>
          </CardHeader>
          <CardContent>
            <AcceptInvitationForm />
          </CardContent>
        </Card>
      </div>
    </Suspense>
  )
}
