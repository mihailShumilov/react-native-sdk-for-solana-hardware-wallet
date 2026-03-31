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
import { getSolanaDerivationPath } from '@solana-hw-wallet/solana';

/**
 * Configuration for the Ledger adapter.
 */
export interface LedgerAdapterConfig {
  /**
   * A Ledger transport instance or factory.
   *
   * For React Native BLE: provide an instance of @ledgerhq/react-native-hw-transport-ble
   * For Node.js USB: provide an instance of @ledgerhq/hw-transport-node-hid
   * For Web BLE: provide an instance of @ledgerhq/hw-transport-web-ble
   *
   * The transport is injected to keep this adapter transport-agnostic.
   */
  transport?: LedgerTransportLike;

  /**
   * Factory function to create a transport.
   * Called during connect() if no transport is provided.
   */
  transportFactory?: () => Promise<LedgerTransportLike>;

  /** Logger */
  logger?: Logger;
}

/**
 * Minimal interface matching Ledger's Transport base class.
 * This allows any Ledger transport implementation to be injected.
 */
export interface LedgerTransportLike {
  send(cla: number, ins: number, p1: number, p2: number, data?: Buffer): Promise<Buffer>;
  close(): Promise<void>;
}

/**
 * Minimal interface matching @ledgerhq/hw-app-solana's Solana class.
 */
interface SolanaApp {
  getAddress(path: string, display?: boolean): Promise<{ address: Buffer }>;
  signTransaction(path: string, transaction: Buffer): Promise<{ signature: Buffer }>;
  signOffchainMessage?(path: string, message: Buffer): Promise<{ signature: Buffer }>;
}

/**
 * Ledger hardware wallet adapter.
 *
 * Supports:
 * - BLE transport (mobile via @ledgerhq/react-native-hw-transport-ble)
 * - USB transport (desktop/Node via @ledgerhq/hw-transport-node-hid)
 * - Account derivation via Solana app
 * - Transaction signing
 * - Message signing (requires Ledger Solana app >= 1.3.0)
 *
 * Prerequisites:
 * - Ledger device must have the Solana app installed and open
 * - Blind signing may need to be enabled for some transactions
 */
export class LedgerAdapter implements HardwareWalletAdapter {
  readonly id = 'ledger';
  readonly name = 'Ledger';
  readonly walletType = WalletType.Ledger;
  readonly supportedTransports = [TransportType.BLE, TransportType.USB];
  readonly features: WalletFeatures = {
    signMessage: true,
    signTransaction: true,
    signVersionedTransaction: true,
    multiAccount: true,
    blindSigning: true,
  };

  private _connectionState = ConnectionState.Disconnected;
  private transport: LedgerTransportLike | null = null;
  private solanaApp: SolanaApp | null = null;
  private transportFactory?: () => Promise<LedgerTransportLike>;
  private logger: Logger;

  constructor(config: LedgerAdapterConfig = {}) {
    this.transport = config.transport ?? null;
    this.transportFactory = config.transportFactory;
    this.logger = config.logger ?? noopLogger;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  async discoverDevices(
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<DiscoveredDevice[]> {
    // Ledger BLE discovery requires platform-specific transport
    // When a transport factory is available, we return a synthetic device
    // Real discovery happens through Ledger's transport libraries
    return [
      {
        id: 'ledger-default',
        name: 'Ledger Device',
        walletType: WalletType.Ledger,
        transport: TransportType.BLE,
        model: 'Nano X / Nano S Plus / Stax',
      },
    ];
  }

  async connect(
    _deviceId?: string,
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<void> {
    if (this._connectionState === ConnectionState.Connected) {
      throw new SdkError(SdkErrorCode.AlreadyConnected, 'Ledger is already connected');
    }

    this._connectionState = ConnectionState.Connecting;

    try {
      if (!this.transport && this.transportFactory) {
        this.transport = await this.transportFactory();
      }

      if (!this.transport) {
        throw new SdkError(
          SdkErrorCode.TransportUnavailable,
          'No Ledger transport provided. Pass a transport or transportFactory in the adapter config.',
          { walletType: WalletType.Ledger },
        );
      }

      // Create the Solana app instance using the transport
      // We dynamically import to avoid hard dependency on @ledgerhq/hw-app-solana
      try {
        const { default: Solana } = await import('@ledgerhq/hw-app-solana');
        this.solanaApp = new Solana(this.transport as never);
      } catch {
        throw new SdkError(
          SdkErrorCode.WalletAppNotOpen,
          'Failed to initialize Ledger Solana app. Ensure @ledgerhq/hw-app-solana is installed and the Solana app is open on the device.',
          { walletType: WalletType.Ledger },
        );
      }

      // Verify the Solana app is open by requesting the default address
      try {
        await this.solanaApp.getAddress(getSolanaDerivationPath(0, 0), false);
      } catch (err) {
        throw new SdkError(
          SdkErrorCode.WalletAppNotOpen,
          'Solana app does not appear to be open on the Ledger device. Please open the Solana app and try again.',
          { walletType: WalletType.Ledger, cause: err instanceof Error ? err : undefined },
        );
      }

      this._connectionState = ConnectionState.Connected;
      this.logger.info('Ledger connected successfully');
    } catch (err) {
      this._connectionState = ConnectionState.Disconnected;
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.Ledger);
    }
  }

  async disconnect(): Promise<void> {
    this._connectionState = ConnectionState.Disconnecting;
    try {
      if (this.transport) {
        await this.transport.close();
      }
    } finally {
      this.transport = null;
      this.solanaApp = null;
      this._connectionState = ConnectionState.Disconnected;
      this.logger.info('Ledger disconnected');
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

      try {
        const result = await this.solanaApp!.getAddress(path, false);
        const publicKeyBytes = new Uint8Array(result.address);

        accounts.push({
          address: this.publicKeyToBase58(publicKeyBytes),
          publicKey: publicKeyBytes,
          derivationPath: path,
          index: accountIndex,
        });
      } catch (err) {
        throw this.mapLedgerError(err, `Failed to derive account at ${path}`);
      }
    }

    return accounts;
  }

  async signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.ensureConnected();

    try {
      const result = await this.solanaApp!.signTransaction(
        derivationPath,
        Buffer.from(transaction),
      );
      return { signature: new Uint8Array(result.signature) };
    } catch (err) {
      throw this.mapLedgerError(err, 'Transaction signing failed');
    }
  }

  async signMessage(message: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.ensureConnected();

    try {
      // signOffchainMessage was added in Ledger Solana app 1.3.0
      if (this.solanaApp!.signOffchainMessage) {
        const result = await this.solanaApp!.signOffchainMessage(
          derivationPath,
          Buffer.from(message),
        );
        return { signature: new Uint8Array(result.signature) };
      }

      // Fallback: sign as a "transaction" (some older Ledger app versions)
      throw new SdkError(
        SdkErrorCode.UnsupportedFeature,
        'Off-chain message signing requires Ledger Solana app >= 1.3.0. Update the Solana app on your Ledger.',
        { walletType: WalletType.Ledger },
      );
    } catch (err) {
      if (err instanceof SdkError) throw err;
      throw this.mapLedgerError(err, 'Message signing failed');
    }
  }

  async dispose(): Promise<void> {
    if (this._connectionState !== ConnectionState.Disconnected) {
      await this.disconnect();
    }
  }

  private ensureConnected(): void {
    if (this._connectionState !== ConnectionState.Connected || !this.solanaApp) {
      throw new SdkError(
        SdkErrorCode.NotConnected,
        'Ledger is not connected. Call connect() first.',
        { walletType: WalletType.Ledger },
      );
    }
  }

  /**
   * Map Ledger-specific errors to SDK errors.
   */
  private mapLedgerError(err: unknown, context: string): SdkError {
    if (err instanceof SdkError) return err;

    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? err : undefined;

    // Ledger error codes
    if (message.includes('0x6985') || message.includes('denied')) {
      return new SdkError(SdkErrorCode.UserCancelled, 'User rejected the request on Ledger', {
        walletType: WalletType.Ledger,
        cause,
      });
    }
    if (message.includes('0x6d00') || message.includes('INS_NOT_SUPPORTED')) {
      return new SdkError(
        SdkErrorCode.WalletAppNotOpen,
        'Solana app is not open on Ledger. Please open the Solana app.',
        { walletType: WalletType.Ledger, cause },
      );
    }
    if (message.includes('0x6e00')) {
      return new SdkError(
        SdkErrorCode.WalletAppNotOpen,
        'Wrong app open on Ledger. Please open the Solana app.',
        { walletType: WalletType.Ledger, cause },
      );
    }
    if (message.includes('blind signing') || message.includes('0x6a80')) {
      return new SdkError(
        SdkErrorCode.BlindSigningRequired,
        'Blind signing must be enabled in the Solana app settings on your Ledger.',
        { walletType: WalletType.Ledger, cause },
      );
    }
    if (message.includes('disconnected') || message.includes('lost connection')) {
      return new SdkError(SdkErrorCode.Disconnected, 'Ledger device disconnected', {
        walletType: WalletType.Ledger,
        cause,
      });
    }

    return new SdkError(SdkErrorCode.Unknown, `${context}: ${message}`, {
      walletType: WalletType.Ledger,
      cause,
    });
  }

  /**
   * Convert raw public key bytes to base58 string.
   * Using a simple base58 implementation to avoid extra dependencies.
   */
  private publicKeyToBase58(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }

    let str = '';
    while (num > BigInt(0)) {
      const remainder = Number(num % BigInt(58));
      num = num / BigInt(58);
      str = ALPHABET[remainder] + str;
    }

    // Add leading '1's for each leading zero byte
    for (const byte of bytes) {
      if (byte === 0) {
        str = '1' + str;
      } else {
        break;
      }
    }

    return str;
  }
}
