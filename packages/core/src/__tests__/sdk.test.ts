import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HardwareWalletSdk,
  createHardwareWalletSdk,
  SdkErrorCode,
  SdkError,
  type HardwareWalletAdapter,
} from '../index.js';
import {
  ConnectionState,
  SdkEvent,
  TransportType,
  WalletType,
  type DerivedAccount,
  type DerivationOptions,
  type DiscoveredDevice,
  type SignResult,
  type TimeoutOptions,
  type WalletFeatures,
} from '@solana-hw-wallet/shared';

/** Inline mock adapter to avoid circular dependency on test-utils */
class InlineMockAdapter implements HardwareWalletAdapter {
  readonly id: string;
  readonly name = 'Mock';
  readonly walletType = WalletType.Ledger;
  readonly supportedTransports = [TransportType.BLE];
  readonly features: WalletFeatures = {
    signMessage: true,
    signTransaction: true,
    signVersionedTransaction: true,
    multiAccount: true,
    blindSigning: false,
  };

  private _state = ConnectionState.Disconnected;
  rejectSigning = false;

  constructor(id = 'mock') {
    this.id = id;
  }

  get connectionState() {
    return this._state;
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return [
      { id: 'dev-1', name: 'Mock', walletType: WalletType.Ledger, transport: TransportType.BLE },
    ];
  }

  async connect(): Promise<void> {
    this._state = ConnectionState.Connecting;
    this._state = ConnectionState.Connected;
  }

  async disconnect(): Promise<void> {
    this._state = ConnectionState.Disconnected;
  }

  async getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]> {
    const count = options?.count ?? 1;
    const start = options?.startIndex ?? options?.accountIndex ?? 0;
    return Array.from({ length: count }, (_, i) => ({
      address: `Addr${start + i}`,
      publicKey: new Uint8Array(32),
      derivationPath: `m/44'/501'/${start + i}'/0'`,
      index: start + i,
    }));
  }

  async signTransaction(_tx: Uint8Array, _path: string): Promise<SignResult> {
    if (this.rejectSigning) {
      throw new SdkError(SdkErrorCode.UserCancelled, 'Rejected');
    }
    return { signature: new Uint8Array(64).fill(0xab) };
  }

  async signMessage(_msg: Uint8Array, _path: string): Promise<SignResult> {
    if (this.rejectSigning) {
      throw new SdkError(SdkErrorCode.UserCancelled, 'Rejected');
    }
    return { signature: new Uint8Array(64).fill(0xcd) };
  }

  async dispose(): Promise<void> {
    await this.disconnect();
  }
}

describe('HardwareWalletSdk', () => {
  let sdk: HardwareWalletSdk;
  let adapter: InlineMockAdapter;

  beforeEach(() => {
    adapter = new InlineMockAdapter('mock');
    sdk = createHardwareWalletSdk({ adapters: [adapter] });
  });

  afterEach(async () => {
    await sdk.dispose();
  });

  describe('initialization', () => {
    it('registers adapters', () => {
      expect(sdk.registeredAdapters).toEqual(['mock']);
    });

    it('starts disconnected', () => {
      expect(sdk.connectionState).toBe(ConnectionState.Disconnected);
    });

    it('returns adapter by ID', () => {
      expect(sdk.getAdapter('mock')).toBe(adapter);
      expect(sdk.getAdapter('nonexistent')).toBeUndefined();
    });
  });

  describe('discovery', () => {
    it('discovers devices from all adapters', async () => {
      const devices = await sdk.discoverDevices();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].walletType).toBeDefined();
    });

    it('discovers from specific adapter', async () => {
      const devices = await sdk.discoverDevices('mock');
      expect(devices.length).toBe(1);
    });

    it('throws for unknown adapter', async () => {
      await expect(sdk.discoverDevices('unknown')).rejects.toThrow('not registered');
    });

    it('emits DeviceDiscovered events', async () => {
      const events: unknown[] = [];
      sdk.on(SdkEvent.DeviceDiscovered, (d) => events.push(d));
      await sdk.discoverDevices();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('connection', () => {
    it('connects to adapter', async () => {
      await sdk.connect('mock');
      expect(sdk.connectionState).toBe(ConnectionState.Connected);
      expect(sdk.currentAdapter).toBe(adapter);
    });

    it('disconnects', async () => {
      await sdk.connect('mock');
      await sdk.disconnect();
      expect(sdk.connectionState).toBe(ConnectionState.Disconnected);
      expect(sdk.currentAdapter).toBeNull();
    });

    it('emits ConnectionStateChanged events', async () => {
      const states: ConnectionState[] = [];
      sdk.on(SdkEvent.ConnectionStateChanged, ({ state }) => states.push(state));
      await sdk.connect('mock');
      expect(states).toContain(ConnectionState.Connecting);
      expect(states).toContain(ConnectionState.Connected);
    });

    it('throws for unknown adapter', async () => {
      await expect(sdk.connect('unknown')).rejects.toThrow('not registered');
    });

    it('disconnects previous adapter when connecting new one', async () => {
      const adapter2 = new InlineMockAdapter('mock2');
      const sdk2 = createHardwareWalletSdk({ adapters: [adapter, adapter2] });
      await sdk2.connect('mock');
      await sdk2.connect('mock2');
      expect(adapter.connectionState).toBe(ConnectionState.Disconnected);
      await sdk2.dispose();
    });
  });

  describe('accounts', () => {
    it('derives accounts when connected', async () => {
      await sdk.connect('mock');
      const accounts = await sdk.getAccounts({ count: 3 });
      expect(accounts).toHaveLength(3);
      expect(accounts[0].derivationPath).toBeDefined();
      expect(accounts[0].address).toBeDefined();
    });

    it('getPublicKey returns single account', async () => {
      await sdk.connect('mock');
      const account = await sdk.getPublicKey(0);
      expect(account.index).toBe(0);
    });

    it('throws when not connected', async () => {
      await expect(sdk.getAccounts()).rejects.toThrow('No hardware wallet connected');
    });
  });

  describe('signing', () => {
    it('signs a transaction', async () => {
      await sdk.connect('mock');
      const tx = new Uint8Array(64).fill(1);
      const result = await sdk.signTransaction(tx, "m/44'/501'/0'/0'");
      expect(result.signature).toHaveLength(64);
    });

    it('signs a message', async () => {
      await sdk.connect('mock');
      const msg = new Uint8Array([1, 2, 3]);
      const result = await sdk.signMessage(msg, "m/44'/501'/0'/0'");
      expect(result.signature).toHaveLength(64);
    });

    it('throws when not connected', async () => {
      const tx = new Uint8Array(64);
      await expect(sdk.signTransaction(tx, "m/44'/501'/0'/0'")).rejects.toThrow();
    });

    it('propagates user cancellation errors', async () => {
      await sdk.connect('mock');
      adapter.rejectSigning = true;
      const tx = new Uint8Array(64);
      try {
        await sdk.signTransaction(tx, "m/44'/501'/0'/0'");
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(SdkError);
        expect((err as SdkError).code).toBe(SdkErrorCode.UserCancelled);
      }
    });
  });

  describe('dispose', () => {
    it('disconnects and cleans up', async () => {
      await sdk.connect('mock');
      await sdk.dispose();
      expect(sdk.registeredAdapters).toHaveLength(0);
      expect(sdk.currentAdapter).toBeNull();
    });
  });
});
