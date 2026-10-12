'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useSimulationSource } from '@/features/route-simulation/hooks/useRouteSimulation'
import { RouteSimulationView } from '@/features/route-simulation/components/RouteSimulationView'

export default function RouteSimulationPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const canRead = !loading && !!user && hasPermission('read.route_simulation')
  const { data: source, isLoading, isError } = useSimulationSource(canRead)

  useEffect(() => {
    if (!loading && user && !hasPermission('read.route_simulation')) router.replace('/dashboard')
  }, [loading, user, hasPermission, router])

  if (!canRead) return null
  if (isLoading) return <p className="text-muted-foreground">Loading...</p>
  if (isError || !source) return <p className="text-bad">Gagal memuat data simulasi. Muat ulang halaman.</p>
  if (!source.cycles.length) return <p className="text-muted-foreground">Belum ada data PnL untuk disimulasikan.</p>
  return <RouteSimulationView source={source} />
}
