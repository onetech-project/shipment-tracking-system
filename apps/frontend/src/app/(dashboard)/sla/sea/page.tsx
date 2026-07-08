'use client'
import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'
import { SEA_SLA_MODE } from '@/features/air-shipments/sla-mode.config'

export default function SlaSeaRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
      <SlaPage mode={SEA_SLA_MODE} />
    </Suspense>
  )
}
