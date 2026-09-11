'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /fleet itself has no content. Armada is the landing section — it is what the sidebar entry is
// really for.
//
// Client-side rather than a server redirect(): the whole dashboard sits behind a client auth gate
// in (dashboard)/layout.tsx, which a server redirect would fire ahead of.
export default function FleetIndexPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fleet/vehicles')
  }, [router])

  return null
}
