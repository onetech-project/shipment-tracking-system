import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'

export default function SlaRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
      <SlaPage />
    </Suspense>
  )
}
