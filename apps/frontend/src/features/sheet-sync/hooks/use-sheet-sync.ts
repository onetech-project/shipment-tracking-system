'use client'
/**
 * T026 — US3: useSheetSync React hook.
 *
 * Connects to the backend Socket.IO gateway on mount, listens for
 * `sheet:updated` events, and calls the optional `onUpdate` callback so the
 * consuming component can re-fetch its data. Returns `connected` status and
 * the latest event payload.
 */
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { SyncNotificationPayload } from '@shared/sync'

export interface UseSheetSyncReturn {
  /** Whether the Socket.IO connection is currently open */
  connected: boolean
  /** The most recent `sheet:updated` event payload, or null if none yet */
  lastEvent: SyncNotificationPayload | null
}

/**
 * @param onUpdate - Optional callback invoked whenever a `sheet:updated` event
 *   arrives. Use this to trigger a data re-fetch (e.g., invalidate a query).
 */
export function useSheetSync(onUpdate?: () => void): UseSheetSyncReturn {
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<SyncNotificationPayload | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Strip the /api suffix from the base URL to reach the root gateway path
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
    const gatewayUrl = apiUrl.replace(/\/api$/, '')

    const socket = io(gatewayUrl, {
      transports: ['websocket'],
      autoConnect: true,
    })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('sheet:updated', (payload: SyncNotificationPayload) => {
      setLastEvent(payload)
      onUpdate?.()
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
    // onUpdate is intentionally excluded from deps — callers should wrap with useCallback
    // if they need stable identity; we don't want reconnects on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { connected, lastEvent }
}
