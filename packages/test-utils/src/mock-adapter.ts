import type { HardwareWalletAdapter } from '@solana-hw-wallet/core';
import { SdkError, SdkErrorCode } from '@solana-hw-wallet/core';
import {
  ConnectionState,
  TransportType,
  WalletType,
  type DerivedAccount,
  type DerivationOptions,
  type DiscoveredDevice,
  type SignResult,
  type TimeoutOptions,
  type WalletFeatures,
} from '@solana-hw-wallet/shared';
import { getSolanaDerivationPath } from '@solana-hw-wallet/solana';

/**
 * Configurable behaviors for the mock adapter.
 */
export interface MockBehavior {
  /** Delay in ms before responding (simulates device latency) */
  delayMs?: number;
  /** If set, connect() will throw this error */
  connectError?: SdkError;
  /** If set, signTransaction() will throw this error */
  signError?: SdkError;
  /** If true, signTransaction() simulates user rejection */
  rejectSigning?: boolean;
  /** Custom accounts to return from getAccounts() */
  accounts?: DerivedAccount[];
  /** Custom signature bytes to return */
  signature?: Uint8Array;
}

export interface MockAdapterConfig {
  id?: string;
  name?: string;
  walletType?: WalletType;
  behavior?: MockBehavior;
}

/**
 * Mock hardware wallet adapter for testing.
 *
 * Implements the full adapter interface with configurable behavior.
 * Use this for unit tests, integration tests, and demo applications
 * without requiring actual hardware.
 */
export class MockAdapter implements HardwareWalletAdapter {
  readonly id: string;
  readonly name: string;
  readonly walletType: WalletType;
  readonly supportedTransports = [TransportType.BLE, TransportType.USB];
  readonly features: WalletFeatures = {
    signMessage: true,
    signTransaction: true,
    signVersionedTransaction: true,
    multiAccount: true,
    blindSigning: false,
  };

  private _connectionState = ConnectionState.Disconnected;
  private behavior: MockBehavior;

  /** Track method calls for test assertions */
  readonly calls: { method: string; args: unknown[] }[] = [];

  constructor(config: MockAdapterConfig = {}) {
    this.id = config.id ?? 'mock';
    this.name = config.name ?? 'Mock Wallet';
    this.walletType = config.walletType ?? WalletType.Ledger;
    this.behavior = config.behavior ?? {};
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /** Update behavior at runtime (useful for test scenarios) */
  setBehavior(behavior: Partial<MockBehavior>): void {
    this.behavior = { ...this.behavior, ...behavior };
  }

  async discoverDevices(
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<DiscoveredDevice[]> {
    this.recordCall('discoverDevices', [_transport, _options]);
    await this.delay();
    return [
      {
        id: `${this.id}-device-1`,
        name: `${this.name} (Mock)`,
        walletType: this.walletType,
        transport: TransportType.BLE,
        model: 'Mock Model',
      },
    ];
  }

  async connect(
    deviceId?: string,
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<void> {
    this.recordCall('connect', [deviceId, _transport, _options]);
    await this.delay();

    if (this.behavior.connectError) {
      throw this.behavior.connectError;
    }

    this._connectionState = ConnectionState.Connecting;
    await this.delay();
    this._connectionState = ConnectionState.Connected;
  }

  async disconnect(): Promise<void> {
    this.recordCall('disconnect', []);
    this._connectionState = ConnectionState.Disconnecting;
    await this.delay();
    this._connectionState = ConnectionState.Disconnected;
  }

  async getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]> {
    this.recordCall('getAccounts', [options]);
    this.ensureConnected();
    await this.delay();

    if (this.behavior.accounts) {
      return this.behavior.accounts;
    }

    const count = options?.count ?? 1;
    const startIndex = options?.startIndex ?? options?.accountIndex ?? 0;
    const changeIndex = options?.changeIndex ?? 0;

    return Array.from({ length: count }, (_, i) => {
      const index = startIndex + i;
      const fakeKey = new Uint8Array(32);
      fakeKey[0] = index;
      fakeKey[31] = 1;

      return {
        address: `MockAddress${index}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 44),
        publicKey: fakeKey,
        derivationPath: getSolanaDerivationPath(index, changeIndex),
        index,
      };
    });
  }

  async signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.recordCall('signTransaction', [transaction, derivationPath]);
    this.ensureConnected();
    await this.delay();

    if (this.behavior.rejectSigning) {
      throw new SdkError(SdkErrorCode.UserCancelled, 'User rejected signing on mock device');
    }
    if (this.behavior.signError) {
      throw this.behavior.signError;
    }

    const signature = this.behavior.signature ?? new Uint8Array(64).fill(0xab);
    return { signature };
  }

  async signMessage(message: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.recordCall('signMessage', [message, derivationPath]);
    this.ensureConnected();
    await this.delay();

    if (this.behavior.rejectSigning) {
      throw new SdkError(SdkErrorCode.UserCancelled, 'User rejected signing on mock device');
    }
    if (this.behavior.signError) {
      throw this.behavior.signError;
    }

    const signature = this.behavior.signature ?? new Uint8Array(64).fill(0xcd);
    return { signature };
  }

  async dispose(): Promise<void> {
    this.recordCall('dispose', []);
    if (this._connectionState !== ConnectionState.Disconnected) {
      await this.disconnect();
    }
  }

  private ensureConnected(): void {
    if (this._connectionState !== ConnectionState.Connected) {
      throw new SdkError(SdkErrorCode.NotConnected, 'Mock wallet not connected');
    }
  }

  private async delay(): Promise<void> {
    const ms = this.behavior.delayMs ?? 10;
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }
}
