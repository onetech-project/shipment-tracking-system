'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/shared/api/client'

export interface GeneralParam {
  key: string
  label: string
  value: string
  updatedAt: string
}

export function useGeneralParams() {
  const [params, setParams] = useState<GeneralParam[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    try {
      const res = await apiClient.get<GeneralParam[]>('/general-params')
      setParams(res.data)
    } catch {
      // keep params as-is; loaded still becomes true so callers use the fallback
    } finally {
      setLoaded(true)
    }
  }

  const update = async (key: string, value: string) => {
    setSaving(true)
    try {
      await apiClient.put(`/general-params/${key}`, { value })
      await load()
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return { params, update, saving, reload: load, loaded }
}
