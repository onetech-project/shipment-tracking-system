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

  const load = async () => {
    const res = await apiClient.get<GeneralParam[]>('/general-params')
    setParams(res.data)
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

  return { params, update, saving, reload: load }
}
