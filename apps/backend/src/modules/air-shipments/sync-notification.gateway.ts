import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SyncNotificationDto } from './dto/sync-notification.dto';

@WebSocketGateway({
  cors: {
    origin: process.env.WEBSOCKET_CORS_ORIGIN ?? '*',
    credentials: true,
  },
})
export class SyncNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SyncNotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(@ConnectedSocket() client: Socket): void {
    this.logger.log(`WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.log(`WebSocket client disconnected: ${client.id}`);
  }

  /**
   * Broadcasts a sync:update event to all connected clients.
   * Only emits when totalUpserted > 0 to avoid noisy zero-change broadcasts (FR-032).
   */
  notifyClients(payload: SyncNotificationDto): void {
    if (payload.totalUpserted === 0) return;
    this.server.emit('sync:update', payload);
  }
}
