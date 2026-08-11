'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BarhalRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/barhal/koli')
  }, [router])

  return null
}
