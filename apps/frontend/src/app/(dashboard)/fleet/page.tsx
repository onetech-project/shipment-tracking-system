'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /fleet itself has no content. Drivers is the landing section in Phase 1; Phase 2 repoints this
// at /fleet/vehicles, which is what the sidebar entry is really for.
//
// Client-side rather than a server redirect(): the whole dashboard sits behind a client auth gate
// in (dashboard)/layout.tsx, which a server redirect would fire ahead of.
export default function FleetIndexPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fleet/drivers')
  }, [router])

  return null
}
