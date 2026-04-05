/**
 * T021 — Unit tests for SyncGateway.
 * Verifies that notifyClients() calls server.emit('sheet:updated', payload)
 * with the correct payload.
 */
import { SyncGateway } from './sync.gateway'
import type { SyncNotificationPayload } from '@shared/sync'

function makeGatewayWithServer(emitMock: jest.Mock) {
  const gw = new SyncGateway()
  // Simulate @WebSocketServer() injection
  ;(gw as any).server = { emit: emitMock }
  return gw
}

describe('SyncGateway', () => {
  it('emits "sheet:updated" with the provided payload', () => {
    const emit = jest.fn()
    const gateway = makeGatewayWithServer(emit)

    const payload: SyncNotificationPayload = {
      table: 'shipments',
      upsertedCount: 3,
      syncedAt: new Date().toISOString(),
    }

    gateway.notifyClients(payload)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('sheet:updated', payload)
  })

  it('emits each time notifyClients is called', () => {
    const emit = jest.fn()
    const gateway = makeGatewayWithServer(emit)

    const payload: SyncNotificationPayload = {
      table: 'trips',
      upsertedCount: 1,
      syncedAt: new Date().toISOString(),
    }

    gateway.notifyClients(payload)
    gateway.notifyClients({ ...payload, upsertedCount: 5 })

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenNthCalledWith(1, 'sheet:updated', payload)
    expect(emit).toHaveBeenNthCalledWith(2, 'sheet:updated', { ...payload, upsertedCount: 5 })
  })
})
