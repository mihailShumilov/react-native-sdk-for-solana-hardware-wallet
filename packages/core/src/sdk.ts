import {
  ConnectionState,
  type DerivedAccount,
  type DerivationOptions,
  type DiscoveredDevice,
  type Logger,
  type SignResult,
  type TimeoutOptions,
  type TransportType,
  SdkEvent,
  type SdkEventMap,
  TypedEventEmitter,
  noopLogger,
} from '@solana-hw-wallet/shared';
import type { HardwareWalletAdapter } from './adapter.js';
import { SdkError, SdkErrorCode, wrapError } from './errors.js';

// ─── SDK Configuration ──────────────────────────────────────────────────────

export interface HardwareWalletSdkConfig {
  /** Wallet adapters to register */
  adapters: HardwareWalletAdapter[];
  /** Optional logger */
  logger?: Logger;
  /** Default timeout for operations (ms) */
  defaultTimeoutMs?: number;
}

// ─── SDK Class ──────────────────────────────────────────────────────────────

/**
 * The main entry point for the Solana Hardware Wallet SDK.
 *
 * Manages adapter lifecycle, device discovery, connection, signing, and events.
 */
export class HardwareWalletSdk extends TypedEventEmitter<SdkEventMap> {
  private adapters: Map<string, HardwareWalletAdapter>;
  private activeAdapter: HardwareWalletAdapter | null = null;
  private activeDeviceId: string | null = null;
  private logger: Logger;
  private defaultTimeoutMs: number;

  constructor(config: HardwareWalletSdkConfig) {
    super();
    this.adapters = new Map(config.adapters.map((a) => [a.id, a]));
    this.logger = config.logger ?? noopLogger;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.logger.info(`SDK initialized with adapters: ${[...this.adapters.keys()].join(', ')}`);
  }

  /** Get all registered adapter IDs */
  get registeredAdapters(): string[] {
    return [...this.adapters.keys()];
  }

  /** Get the currently active adapter, if any */
  get currentAdapter(): HardwareWalletAdapter | null {
    return this.activeAdapter;
  }

  /** Get the current connection state */
  get connectionState(): ConnectionState {
    return this.activeAdapter?.connectionState ?? ConnectionState.Disconnected;
  }

  /** Get a specific adapter by ID */
  getAdapter(adapterId: string): HardwareWalletAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Discover devices across all registered adapters (or a specific one).
   */
  async discoverDevices(
    adapterId?: string,
    transport?: TransportType,
    options?: TimeoutOptions,
  ): Promise<DiscoveredDevice[]> {
    const timeout = options?.timeoutMs ?? this.defaultTimeoutMs;

    const adaptersToQuery = adapterId
      ? [this.requireAdapter(adapterId)]
      : [...this.adapters.values()];

    const results = await Promise.allSettled(
      adaptersToQuery.map((adapter) =>
        adapter.discoverDevices(transport, { timeoutMs: timeout }),
      ),
    );

    const devices: DiscoveredDevice[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        devices.push(...result.value);
      } else {
        this.logger.warn('Discovery failed for an adapter:', result.reason);
      }
    }

    for (const device of devices) {
      this.emit(SdkEvent.DeviceDiscovered, device);
    }

    return devices;
  }

  /**
   * Connect to a device using the specified adapter.
   */
  async connect(
    adapterId: string,
    deviceId?: string,
    transport?: TransportType,
    options?: TimeoutOptions,
  ): Promise<void> {
    const adapter = this.requireAdapter(adapterId);
    const timeout = options?.timeoutMs ?? this.defaultTimeoutMs;

    if (this.activeAdapter && this.activeAdapter.connectionState !== ConnectionState.Disconnected) {
      await this.disconnect();
    }

    const previousState = adapter.connectionState;
    this.emit(SdkEvent.ConnectionStateChanged, {
      deviceId: deviceId ?? adapterId,
      state: ConnectionState.Connecting,
      previousState,
    });

    try {
      await adapter.connect(deviceId, transport, { timeoutMs: timeout });
      this.activeAdapter = adapter;
      this.activeDeviceId = deviceId ?? adapterId;

      this.emit(SdkEvent.ConnectionStateChanged, {
        deviceId: this.activeDeviceId,
        state: ConnectionState.Connected,
        previousState: ConnectionState.Connecting,
      });

      this.logger.info(`Connected to ${adapter.name} (${this.activeDeviceId})`);
    } catch (err) {
      this.emit(SdkEvent.ConnectionStateChanged, {
        deviceId: deviceId ?? adapterId,
        state: ConnectionState.Disconnected,
        previousState: ConnectionState.Connecting,
      });
      throw wrapError(err, adapter.walletType);
    }
  }

  /**
   * Disconnect from the currently connected device.
   */
  async disconnect(): Promise<void> {
    if (!this.activeAdapter) return;

    const deviceId = this.activeDeviceId ?? this.activeAdapter.id;
    const previousState = this.activeAdapter.connectionState;

    try {
      await this.activeAdapter.disconnect();
    } finally {
      this.emit(SdkEvent.ConnectionStateChanged, {
        deviceId,
        state: ConnectionState.Disconnected,
        previousState,
      });
      this.activeAdapter = null;
      this.activeDeviceId = null;
    }
  }

  /**
   * Derive Solana accounts from the connected hardware wallet.
   */
  async getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]> {
    const adapter = this.requireConnected();
    try {
      return await adapter.getAccounts(options);
    } catch (err) {
      throw wrapError(err, adapter.walletType);
    }
  }

  /**
   * Get a single public key at a specific derivation index.
   */
  async getPublicKey(accountIndex = 0, changeIndex = 0): Promise<DerivedAccount> {
    const accounts = await this.getAccounts({ accountIndex, changeIndex, count: 1 });
    if (accounts.length === 0) {
      throw new SdkError(SdkErrorCode.DerivationFailed, 'No account derived');
    }
    return accounts[0];
  }

  /**
   * Sign a serialized transaction.
   */
  async signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult> {
    const adapter = this.requireConnected();
    if (!adapter.features.signTransaction) {
      throw new SdkError(SdkErrorCode.UnsupportedFeature, 'Transaction signing not supported', {
        walletType: adapter.walletType,
      });
    }
    try {
      return await adapter.signTransaction(transaction, derivationPath);
    } catch (err) {
      throw wrapError(err, adapter.walletType);
    }
  }

  /**
   * Sign an arbitrary message.
   */
  async signMessage(message: Uint8Array, derivationPath: string): Promise<SignResult> {
    const adapter = this.requireConnected();
    if (!adapter.features.signMessage) {
      throw new SdkError(SdkErrorCode.UnsupportedFeature, 'Message signing not supported', {
        walletType: adapter.walletType,
      });
    }
    try {
      return await adapter.signMessage(message, derivationPath);
    } catch (err) {
      throw wrapError(err, adapter.walletType);
    }
  }

  /**
   * Dispose all adapters and clean up.
   */
  async dispose(): Promise<void> {
    if (this.activeAdapter) {
      await this.disconnect();
    }
    await Promise.allSettled([...this.adapters.values()].map((a) => a.dispose()));
    this.adapters.clear();
    this.removeAllListeners();
    this.logger.info('SDK disposed');
  }

  private requireAdapter(adapterId: string): HardwareWalletAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new SdkError(
        SdkErrorCode.UnsupportedWallet,
        `Adapter "${adapterId}" not registered. Available: ${[...this.adapters.keys()].join(', ')}`,
      );
    }
    return adapter;
  }

  private requireConnected(): HardwareWalletAdapter {
    if (!this.activeAdapter || this.activeAdapter.connectionState !== ConnectionState.Connected) {
      throw new SdkError(
        SdkErrorCode.NotConnected,
        'No hardware wallet connected. Call connect() first.',
      );
    }
    return this.activeAdapter;
  }
}

/**
 * Factory function to create the SDK instance.
 */
export function createHardwareWalletSdk(config: HardwareWalletSdkConfig): HardwareWalletSdk {
  return new HardwareWalletSdk(config);
}
