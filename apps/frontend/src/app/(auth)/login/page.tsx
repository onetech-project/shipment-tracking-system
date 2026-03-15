'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth.context';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      await login(data.username, data.password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Login failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ background: '#fff', padding: '2rem', borderRadius: 8, width: 360, boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}
      >
        <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>Sign In</h1>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem', borderRadius: 4, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="username">Username</label>
          <input id="username" {...register('username')} style={{ display: 'block', width: '100%', padding: '.5rem', marginTop: 4 }} />
          {errors.username && <span style={{ color: '#dc2626', fontSize: '.875rem' }}>{errors.username.message}</span>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" {...register('password')} style={{ display: 'block', width: '100%', padding: '.5rem', marginTop: 4 }} />
          {errors.password && <span style={{ color: '#dc2626', fontSize: '.875rem' }}>{errors.password.message}</span>}
        </div>

        <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
