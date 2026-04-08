import { Test, TestingModule } from '@nestjs/testing';
import { SyncNotificationGateway } from './sync-notification.gateway';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

const makeServer = () => ({
  emit: jest.fn(),
});

const makeSocket = (id = 'client-123'): Partial<Socket> => ({ id } as any);

describe('SyncNotificationGateway', () => {
  let gateway: SyncNotificationGateway;
  let mockServer: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncNotificationGateway],
    }).compile();

    gateway = module.get<SyncNotificationGateway>(SyncNotificationGateway);
    mockServer = makeServer();
    // Inject mock server
    (gateway as any).server = mockServer as unknown as Server;
  });

  it('logs client ID on connection', () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const socket = makeSocket('client-abc');
    gateway.handleConnection(socket as Socket);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('client-abc'));
    spy.mockRestore();
  });

  it('logs client ID on disconnection', () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const socket = makeSocket('client-xyz');
    gateway.handleDisconnect(socket as Socket);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('client-xyz'));
    spy.mockRestore();
  });

  it('emits sync:update to all clients when totalUpserted > 0', () => {
    const payload = { affectedTables: ['air_shipments_cgk'], totalUpserted: 3, syncedAt: new Date().toISOString() };
    gateway.notifyClients(payload);
    expect(mockServer.emit).toHaveBeenCalledWith('sync:update', payload);
  });

  it('does NOT emit when totalUpserted is 0', () => {
    const payload = { affectedTables: [], totalUpserted: 0, syncedAt: new Date().toISOString() };
    gateway.notifyClients(payload);
    expect(mockServer.emit).not.toHaveBeenCalled();
  });
});
