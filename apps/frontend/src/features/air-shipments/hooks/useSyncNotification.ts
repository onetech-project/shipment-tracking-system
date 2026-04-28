'use client'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SyncNotificationPayload } from '../types'

export interface UseSyncNotificationResult {
  isConnected: boolean
  lastSyncAt: string | null
  affectedTables: string[]
  lastCompletedSheet: string | null
  lastCompletedAt: string | null
}

export function useSyncNotification(): UseSyncNotificationResult {
  const [isConnected, setIsConnected] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [affectedTables, setAffectedTables] = useState<string[]>([])
  const [lastCompletedSheet, setLastCompletedSheet] = useState<string | null>(null)
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'
    const socket = io(wsUrl, { transports: ['websocket'], withCredentials: true })
    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('sync:update', (payload: SyncNotificationPayload) => {
      setLastSyncAt(payload.syncedAt)
      setAffectedTables(payload.affectedTables)
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
    affectedTables,
    lastCompletedSheet,
    lastCompletedAt,
  }
}
