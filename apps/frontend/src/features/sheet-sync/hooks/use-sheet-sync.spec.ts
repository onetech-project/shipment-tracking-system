/**
 * T022 — Unit tests for useSheetSync hook.
 *
 * NOTE: The frontend does not yet have Jest + @testing-library/react configured.
 * To run these tests, add the following to apps/frontend/package.json:
 *   "jest", "@testing-library/react", "@testing-library/react-hooks", "jest-environment-jsdom"
 * and add a jest.config.ts pointing to tsconfig.json.
 *
 * These tests are written against the standard @testing-library/react-hooks API
 * and serve as the authoritative contract for the hook's behaviour.
 */

// Mocks must be declared before imports that use the module
jest.mock('socket.io-client')

import { renderHook, act } from '@testing-library/react-hooks'
import { io } from 'socket.io-client'
import { useSheetSync } from './use-sheet-sync'
import type { SyncNotificationPayload } from '@shared/sync'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventMap = Record<string, ((...args: unknown[]) => void)[]>

function makeMockSocket() {
  const handlers: EventMap = {}
  const socket = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(handler)
    }),
    disconnect: jest.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      ;(handlers[event] ?? []).forEach((h) => h(...args))
    },
  }
  return socket
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSheetSync', () => {
  let mockSocket: ReturnType<typeof makeMockSocket>

  beforeEach(() => {
    mockSocket = makeMockSocket()
    ;(io as jest.Mock).mockReturnValue(mockSocket)
  })

  afterEach(() => jest.restoreAllMocks())

  it('starts with connected=false and lastEvent=null', () => {
    const { result } = renderHook(() => useSheetSync())
    expect(result.current.connected).toBe(false)
    expect(result.current.lastEvent).toBeNull()
  })

  it('sets connected=true when the "connect" event fires', () => {
    const { result } = renderHook(() => useSheetSync())

    act(() => {
      mockSocket._emit('connect')
    })

    expect(result.current.connected).toBe(true)
  })

  it('sets connected=false when the "disconnect" event fires', () => {
    const { result } = renderHook(() => useSheetSync())

    act(() => {
      mockSocket._emit('connect')
    })
    act(() => {
      mockSocket._emit('disconnect')
    })

    expect(result.current.connected).toBe(false)
  })

  it('stores the latest event in lastEvent on "sheet:updated"', () => {
    const { result } = renderHook(() => useSheetSync())
    const payload: SyncNotificationPayload = {
      table: 'shipments',
      upsertedCount: 5,
      syncedAt: new Date().toISOString(),
    }

    act(() => {
      mockSocket._emit('sheet:updated', payload)
    })

    expect(result.current.lastEvent).toEqual(payload)
  })

  it('calls onUpdate callback when "sheet:updated" fires', () => {
    const onUpdate = jest.fn()
    renderHook(() => useSheetSync(onUpdate))

    const payload: SyncNotificationPayload = {
      table: 'trips',
      upsertedCount: 2,
      syncedAt: new Date().toISOString(),
    }

    act(() => {
      mockSocket._emit('sheet:updated', payload)
    })

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('replaces lastEvent with the newest payload on subsequent events', () => {
    const { result } = renderHook(() => useSheetSync())

    const first: SyncNotificationPayload = {
      table: 'shipments',
      upsertedCount: 1,
      syncedAt: new Date().toISOString(),
    }
    const second: SyncNotificationPayload = {
      table: 'shipments',
      upsertedCount: 3,
      syncedAt: new Date().toISOString(),
    }

    act(() => {
      mockSocket._emit('sheet:updated', first)
    })
    act(() => {
      mockSocket._emit('sheet:updated', second)
    })

    expect(result.current.lastEvent).toEqual(second)
  })

  it('calls socket.disconnect() on hook unmount', () => {
    const { unmount } = renderHook(() => useSheetSync())
    unmount()
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1)
  })
})
