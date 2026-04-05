/**
 * T024 — US3: WebSocket gateway for real-time sync notifications.
 *
 * Emits a `sheet:updated` event to all connected Socket.IO clients after
 * each sync cycle that produced at least one upserted row.
 */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'
import type { SyncNotificationPayload } from '@shared/sync'

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class SyncGateway {
  @WebSocketServer()
  server: Server

  /**
   * Broadcast a sync-cycle completion event to every connected client.
   * Called by SheetSyncService at the end of a cycle when upsertedCount > 0.
   */
  notifyClients(payload: SyncNotificationPayload): void {
    this.server.emit('sheet:updated', payload)
  }
}
