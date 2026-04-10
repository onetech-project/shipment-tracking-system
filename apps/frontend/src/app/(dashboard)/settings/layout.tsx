'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useAuth } from '@/features/auth/auth.context'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { isAdminOrAbove } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !isAdminOrAbove) {
      router.replace('/settings/forbidden')
    }
  }, [loading, user, isAdminOrAbove, router])

  if (loading) return null
  if (!isAdminOrAbove) return null

  return <>{children}</>
}
