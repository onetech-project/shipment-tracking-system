'use client'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SyncNotificationPayload } from '../types'
import { apiClient } from '@/shared/api/client'

export interface UseSyncNotificationResult {
  isConnected: boolean
  lastSyncAt: string | null
  lastSyncAtByTable: Record<string, string>
  affectedTables: string[]
  lastCompletedSheet: string | null
  lastCompletedAt: string | null
}

export function useSyncNotification(): UseSyncNotificationResult {
  const [isConnected, setIsConnected] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [lastSyncAtByTable, setLastSyncAtByTable] = useState<Record<string, string>>({})
  const [affectedTables, setAffectedTables] = useState<string[]>([])
  const [lastCompletedSheet, setLastCompletedSheet] = useState<string | null>(null)
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    apiClient
      .get<{ lastSyncAt: string | null; byTable: Record<string, string | null> }>('/air-shipments/last-sync')
      .then((r) => {
        if (r.data.lastSyncAt) setLastSyncAt(r.data.lastSyncAt)
        const seeded: Record<string, string> = {}
        for (const [t, ts] of Object.entries(r.data.byTable)) {
          if (ts) seeded[t] = ts
        }
        setLastSyncAtByTable(seeded)
      })
      .catch(() => {})

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'
    const socket = io(wsUrl, { transports: ['websocket'], withCredentials: true })
    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('sync:update', (payload: SyncNotificationPayload) => {
      setLastSyncAt(payload.syncedAt)
      setAffectedTables(payload.affectedTables)
      setLastSyncAtByTable((prev) => {
        const next = { ...prev }
        payload.affectedTables.forEach((t) => { next[t] = payload.syncedAt })
        return next
      })
    })
    socket.on('sync.completed', (payload: { sheet: string }) => {
      setLastCompletedSheet(payload.sheet)
      setLastCompletedAt(new Date().toISOString())
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return {
    isConnected,
    lastSyncAt,
    lastSyncAtByTable,
    affectedTables,
    lastCompletedSheet,
    lastCompletedAt,
  }
}
