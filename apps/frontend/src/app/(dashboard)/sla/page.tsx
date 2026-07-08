'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** Old bookmarks land here; forward filters (?alert=…&route=…) to the Air tab. */
export default function SlaIndexRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    router.replace(qs ? `/sla/air?${qs}` : '/sla/air')
  }, [router, searchParams])

  return null
}
