import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../mock-adapter.js';
import { SdkError, SdkErrorCode } from '@solana-hw-wallet/core';
import { ConnectionState } from '@solana-hw-wallet/shared';

describe('MockAdapter', () => {
  it('starts disconnected', () => {
    const adapter = new MockAdapter();
    expect(adapter.connectionState).toBe(ConnectionState.Disconnected);
  });

  it('discovers mock devices', async () => {
    const adapter = new MockAdapter({ behavior: { delayMs: 0 } });
    const devices = await adapter.discoverDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toContain('Mock');
  });

  it('connects and disconnects', async () => {
    const adapter = new MockAdapter({ behavior: { delayMs: 0 } });
    await adapter.connect();
    expect(adapter.connectionState).toBe(ConnectionState.Connected);
    await adapter.disconnect();
    expect(adapter.connectionState).toBe(ConnectionState.Disconnected);
  });

  it('derives accounts', async () => {
    const adapter = new MockAdapter({ behavior: { delayMs: 0 } });
    await adapter.connect();
    const accounts = await adapter.getAccounts({ count: 3 });
    expect(accounts).toHaveLength(3);
    expect(accounts[0].index).toBe(0);
    expect(accounts[1].index).toBe(1);
    expect(accounts[2].index).toBe(2);
  });

  it('simulates connection error', async () => {
    const adapter = new MockAdapter({
      behavior: {
        delayMs: 0,
        connectError: new SdkError(SdkErrorCode.ConnectionFailed, 'Mock connection failed'),
      },
    });
    await expect(adapter.connect()).rejects.toThrow('Mock connection failed');
  });

  it('simulates user rejection', async () => {
    const adapter = new MockAdapter({
      behavior: { delayMs: 0, rejectSigning: true },
    });
    await adapter.connect();
    await expect(adapter.signTransaction(new Uint8Array(64), "m/44'/501'/0'/0'")).rejects.toThrow(
      'User rejected',
    );
  });

  it('records method calls', async () => {
    const adapter = new MockAdapter({ behavior: { delayMs: 0 } });
    await adapter.connect('device-1');
    expect(adapter.calls.some((c) => c.method === 'connect')).toBe(true);
  });

  it('allows runtime behavior changes', async () => {
    const adapter = new MockAdapter({ behavior: { delayMs: 0 } });
    await adapter.connect();

    // First sign succeeds
    const result = await adapter.signTransaction(new Uint8Array(64), "m/44'/501'/0'/0'");
    expect(result.signature).toBeDefined();

    // Change behavior to reject
    adapter.setBehavior({ rejectSigning: true });
    await expect(adapter.signTransaction(new Uint8Array(64), "m/44'/501'/0'/0'")).rejects.toThrow();
  });
});
