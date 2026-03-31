import type { HardwareWalletAdapter } from '@solana-hw-wallet/core';
import { SdkError, SdkErrorCode, wrapError } from '@solana-hw-wallet/core';
import {
  ConnectionState,
  TransportType,
  WalletType,
  type DerivedAccount,
  type DerivationOptions,
  type DiscoveredDevice,
  type Logger,
  type SignResult,
  type TimeoutOptions,
  type WalletFeatures,
  noopLogger,
} from '@solana-hw-wallet/shared';
import { derivationPathToBuffer, getSolanaDerivationPath } from '@solana-hw-wallet/solana';

/**
 * Configuration for the Trezor adapter.
 */
export interface TrezorAdapterConfig {
  /**
   * Trezor Connect manifest.
   * Required by @trezor/connect for identifying the application.
   */
  manifest?: {
    email: string;
    appUrl: string;
    appName?: string;
  };

  /** Logger */
  logger?: Logger;
}

/**
 * Trezor hardware wallet adapter.
 *
 * Uses @trezor/connect for communication with Trezor devices.
 * Supports USB transport primarily (BLE not natively supported by Trezor).
 *
 * Supports:
 * - Account derivation (Solana address)
 * - Transaction signing
 * - Multi-account via BIP44 derivation
 *
 * Limitations:
 * - Message signing: Trezor supports Solana message signing only on Model T
 *   and newer firmware. Support is limited compared to Ledger.
 * - React Native: @trezor/connect is primarily web/Node.js focused.
 *   React Native integration requires a WebView bridge or native module.
 *   This adapter works well in Node.js environments; for React Native,
 *   consider using the Trezor Connect WebView approach.
 *
 * Prerequisites:
 * - @trezor/connect package installed
 * - Trezor Bridge running (desktop) or WebUSB support (browser)
 * - Device unlocked and PIN entered
 */
export class TrezorAdapter implements HardwareWalletAdapter {
  readonly id = 'trezor';
  readonly name = 'Trezor';
  readonly walletType = WalletType.Trezor;
  readonly supportedTransports = [TransportType.USB];
  readonly features: WalletFeatures = {
    signMessage: false, // Limited support, documented below
    signTransaction: true,
    signVersionedTransaction: true,
    multiAccount: true,
    blindSigning: false,
  };

  private _connectionState = ConnectionState.Disconnected;
  private trezorConnect: TrezorConnectLike | null = null;
  private manifest: { email: string; appUrl: string };
  private logger: Logger;

  constructor(config: TrezorAdapterConfig = {}) {
    this.manifest = config.manifest ?? {
      email: 'developer@example.com',
      appUrl: 'https://example.com',
      appName: 'Solana HW Wallet SDK',
    };
    this.logger = config.logger ?? noopLogger;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  async discoverDevices(
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<DiscoveredDevice[]> {
    return [
      {
        id: 'trezor-default',
        name: 'Trezor Device',
        walletType: WalletType.Trezor,
        transport: TransportType.USB,
        model: 'Model T / Model One / Safe 3',
      },
    ];
  }

  async connect(
    _deviceId?: string,
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<void> {
    if (this._connectionState === ConnectionState.Connected) {
      throw new SdkError(SdkErrorCode.AlreadyConnected, 'Trezor is already connected');
    }

    this._connectionState = ConnectionState.Connecting;

    try {
      // Dynamically import @trezor/connect
      try {
        const trezorModule = await import('@trezor/connect');
        this.trezorConnect = (trezorModule.default ?? trezorModule) as unknown as TrezorConnectLike;
      } catch {
        throw new SdkError(
          SdkErrorCode.TransportUnavailable,
          '@trezor/connect is not installed. Install it with: pnpm add @trezor/connect',
          { walletType: WalletType.Trezor },
        );
      }

      // Initialize Trezor Connect
      await this.trezorConnect!.init({
        manifest: this.manifest,
        lazyLoad: false,
      });

      // Verify connection by requesting the first address
      const path = getSolanaDerivationPath(0, 0);
      const result = await this.trezorConnect!.solanaGetAddress({
        path: derivationPathToBuffer(path),
        showOnTrezor: false,
      });

      if (!result.success) {
        throw new SdkError(
          SdkErrorCode.ConnectionFailed,
          `Failed to connect to Trezor: ${result.payload?.error ?? 'Unknown error'}`,
          { walletType: WalletType.Trezor },
        );
      }

      this._connectionState = ConnectionState.Connected;
      this.logger.info('Trezor connected successfully');
    } catch (err) {
      this._connectionState = ConnectionState.Disconnected;
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.Trezor);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.trezorConnect) {
        this.trezorConnect.dispose();
      }
    } finally {
      this.trezorConnect = null;
      this._connectionState = ConnectionState.Disconnected;
      this.logger.info('Trezor disconnected');
    }
  }

  async getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]> {
    this.ensureConnected();

    const count = options?.count ?? 1;
    const startIndex = options?.startIndex ?? options?.accountIndex ?? 0;
    const changeIndex = options?.changeIndex ?? 0;

    const accounts: DerivedAccount[] = [];

    for (let i = 0; i < count; i++) {
      const accountIndex = startIndex + i;
      const path = getSolanaDerivationPath(accountIndex, changeIndex);

      const result = await this.trezorConnect!.solanaGetAddress({
        path: derivationPathToBuffer(path),
        showOnTrezor: false,
      });

      if (!result.success) {
        throw this.mapTrezorError(result.payload, `Failed to derive account at ${path}`);
      }

      const addressStr = result.payload.address;
      const publicKeyBytes = this.base58ToBytes(addressStr);

      accounts.push({
        address: addressStr,
        publicKey: publicKeyBytes,
        derivationPath: path,
        index: accountIndex,
      });
    }

    return accounts;
  }

  async signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.ensureConnected();

    try {
      const result = await this.trezorConnect!.solanaSignTransaction({
        path: derivationPathToBuffer(derivationPath),
        serializedTx: Buffer.from(transaction).toString('hex'),
      });

      if (!result.success) {
        throw this.mapTrezorError(result.payload, 'Transaction signing failed');
      }

      const signature = new Uint8Array(Buffer.from(result.payload.signature, 'hex'));
      return { signature };
    } catch (err) {
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.Trezor);
    }
  }

  async signMessage(_message: Uint8Array, _derivationPath: string): Promise<SignResult> {
    // Trezor's Solana message signing support is limited.
    // As of 2024, it's available on Model T with newer firmware but
    // the @trezor/connect API for Solana message signing is not stable.
    throw new SdkError(
      SdkErrorCode.UnsupportedFeature,
      'Trezor does not reliably support Solana off-chain message signing. ' +
        'This feature is limited to certain models and firmware versions. ' +
        'Use transaction signing instead, or consider a different wallet for message signing.',
      { walletType: WalletType.Trezor },
    );
  }

  async dispose(): Promise<void> {
    if (this._connectionState !== ConnectionState.Disconnected) {
      await this.disconnect();
    }
  }

  private ensureConnected(): void {
    if (this._connectionState !== ConnectionState.Connected || !this.trezorConnect) {
      throw new SdkError(
        SdkErrorCode.NotConnected,
        'Trezor is not connected. Call connect() first.',
        { walletType: WalletType.Trezor },
      );
    }
  }

  private mapTrezorError(payload: { error?: string; code?: string }, context: string): SdkError {
    const message = payload?.error ?? 'Unknown Trezor error';
    const code = payload?.code;

    if (code === 'Failure_ActionCancelled' || message.includes('cancelled')) {
      return new SdkError(SdkErrorCode.UserCancelled, 'User cancelled the request on Trezor', {
        walletType: WalletType.Trezor,
      });
    }
    if (message.includes('PIN') || message.includes('locked')) {
      return new SdkError(SdkErrorCode.WalletLocked, 'Trezor device is locked. Enter PIN.', {
        walletType: WalletType.Trezor,
      });
    }
    if (message.includes('not connected') || message.includes('device disconnected')) {
      return new SdkError(SdkErrorCode.Disconnected, 'Trezor device disconnected', {
        walletType: WalletType.Trezor,
      });
    }

    return new SdkError(SdkErrorCode.Unknown, `${context}: ${message}`, {
      walletType: WalletType.Trezor,
    });
  }

  private base58ToBytes(base58: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP = new Map(ALPHABET.split('').map((c, i) => [c, BigInt(i)]));

    let num = BigInt(0);
    for (const char of base58) {
      const val = ALPHABET_MAP.get(char);
      if (val === undefined) throw new Error(`Invalid base58 character: ${char}`);
      num = num * BigInt(58) + val;
    }

    const bytes: number[] = [];
    while (num > BigInt(0)) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    // Add leading zero bytes
    for (const char of base58) {
      if (char === '1') bytes.unshift(0);
      else break;
    }

    return new Uint8Array(bytes);
  }
}

// ─── Trezor Connect type shim ───────────────────────────────────────────────

/**
 * Minimal type interface for @trezor/connect to avoid hard dependency.
 * The actual module is dynamically imported at runtime.
 */
interface TrezorConnectLike {
  init(params: { manifest: { email: string; appUrl: string }; lazyLoad: boolean }): Promise<void>;
  dispose(): void;
  solanaGetAddress(params: {
    path: number[];
    showOnTrezor: boolean;
  }): Promise<TrezorResponse<{ address: string }>>;
  solanaSignTransaction(params: {
    path: number[];
    serializedTx: string;
  }): Promise<TrezorResponse<{ signature: string }>>;
}

type TrezorResponse<T> =
  | { success: true; payload: T }
  | { success: false; payload: { error?: string; code?: string } };
