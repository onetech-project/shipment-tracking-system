/**
 * Unit tests for useSyncNotification hook.
 *
 * socket.io-client is mocked to avoid actual network connections.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useSyncNotification } from './useSyncNotification';

// Mock socket.io-client
const mockOn = jest.fn();
const mockOff = jest.fn();
const mockDisconnect = jest.fn();
const mockSocket = {
  on: mockOn,
  off: mockOff,
  disconnect: mockDisconnect,
  connected: false,
};
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('useSyncNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with isConnected: false', () => {
    const { result } = renderHook(() => useSyncNotification());
    expect(result.current.isConnected).toBe(false);
  });

  it('sets isConnected to true when connect event fires', () => {
    const { result } = renderHook(() => useSyncNotification());

    // Find and invoke the 'connect' handler registered via socket.on
    const connectHandler = mockOn.mock.calls.find(([event]) => event === 'connect')?.[1];
    expect(connectHandler).toBeDefined();

    act(() => {
      connectHandler();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('sets isConnected to false when disconnect event fires', () => {
    const { result } = renderHook(() => useSyncNotification());

    const connectHandler = mockOn.mock.calls.find(([event]) => event === 'connect')?.[1];
    const disconnectHandler = mockOn.mock.calls.find(([event]) => event === 'disconnect')?.[1];

    act(() => connectHandler?.());
    act(() => disconnectHandler?.());

    expect(result.current.isConnected).toBe(false);
  });

  it('updates lastSyncAt and affectedTables on sync:update event', () => {
    const { result } = renderHook(() => useSyncNotification());
    const syncHandler = mockOn.mock.calls.find(([event]) => event === 'sync:update')?.[1];
    expect(syncHandler).toBeDefined();

    const payload = { affectedTables: ['air_shipments_cgk'], totalUpserted: 5, syncedAt: '2026-04-08T12:00:00.000Z' };
    act(() => {
      syncHandler(payload);
    });

    expect(result.current.lastSyncAt).toBe('2026-04-08T12:00:00.000Z');
    expect(result.current.affectedTables).toEqual(['air_shipments_cgk']);
  });

  it('disconnects the socket on unmount', () => {
    const { unmount } = renderHook(() => useSyncNotification());
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
