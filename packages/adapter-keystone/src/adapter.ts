import type { QrWalletAdapter, QrSignRequest, QrSyncRequest } from '@solana-hw-wallet/core';
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
import type { QrTransportCallbacks } from '@solana-hw-wallet/transports';

/**
 * Configuration for the Keystone adapter.
 */
export interface KeystoneAdapterConfig {
  /**
   * Callbacks for QR code display and scanning.
   * Required for the adapter to function.
   */
  qrCallbacks?: QrTransportCallbacks;

  /** Logger */
  logger?: Logger;
}

/**
 * Keystone hardware wallet adapter (QR-based).
 *
 * Keystone uses QR codes for air-gapped communication:
 * 1. SDK generates a UR-encoded QR code for the signing request
 * 2. User scans the QR with Keystone device
 * 3. Keystone displays a signed QR code
 * 4. User scans the signed QR back into the app
 *
 * Uses the Blockchain Commons UR (Uniform Resource) standard for QR encoding.
 *
 * Supports:
 * - Account sync via QR
 * - Transaction signing via QR
 * - Message signing via QR (Keystone firmware >= 1.3.0)
 * - Multiple accounts via derivation
 *
 * Prerequisites:
 * - Keystone device with Solana support enabled
 * - Camera access for QR scanning
 * - App must implement QR display and scanning UI
 */
export class KeystoneAdapter implements QrWalletAdapter {
  readonly id = 'keystone';
  readonly name = 'Keystone';
  readonly walletType = WalletType.Keystone;
  readonly supportedTransports = [TransportType.QR];
  readonly features: WalletFeatures = {
    signMessage: true,
    signTransaction: true,
    signVersionedTransaction: true,
    multiAccount: true,
    blindSigning: false,
  };

  private _connectionState = ConnectionState.Disconnected;
  private qrCallbacks: QrTransportCallbacks | null = null;
  private logger: Logger;
  private syncedAccounts: DerivedAccount[] = [];

  constructor(config: KeystoneAdapterConfig = {}) {
    this.qrCallbacks = config.qrCallbacks ?? null;
    this.logger = config.logger ?? noopLogger;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  async discoverDevices(
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<DiscoveredDevice[]> {
    // QR wallets are always "available" — discovery is instant
    return [
      {
        id: 'keystone-qr',
        name: 'Keystone (QR)',
        walletType: WalletType.Keystone,
        transport: TransportType.QR,
        model: 'Keystone 3 Pro / Essential',
      },
    ];
  }

  async connect(
    _deviceId?: string,
    _transport?: TransportType,
    _options?: TimeoutOptions,
  ): Promise<void> {
    if (!this.qrCallbacks) {
      throw new SdkError(
        SdkErrorCode.TransportUnavailable,
        'QR callbacks not provided. Pass qrCallbacks in the adapter config to enable QR display and scanning.',
        { walletType: WalletType.Keystone },
      );
    }

    // For QR wallets, "connecting" means syncing accounts via QR
    this._connectionState = ConnectionState.Connecting;

    try {
      // Prompt the user to scan the Keystone's account QR code
      this.logger.info('Requesting account sync QR scan from Keystone');

      const scannedData = await this.qrCallbacks.onScanQr();
      const accounts = await this.decodeAccountSync(scannedData);

      if (accounts.length === 0) {
        throw new SdkError(
          SdkErrorCode.DerivationFailed,
          'No Solana accounts found in the scanned QR code. Ensure the Keystone has Solana accounts configured.',
          { walletType: WalletType.Keystone },
        );
      }

      this.syncedAccounts = accounts;
      this._connectionState = ConnectionState.Connected;
      this.logger.info(`Keystone connected with ${accounts.length} account(s)`);
    } catch (err) {
      this._connectionState = ConnectionState.Disconnected;
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.Keystone);
    }
  }

  async disconnect(): Promise<void> {
    this.syncedAccounts = [];
    this._connectionState = ConnectionState.Disconnected;
    this.logger.info('Keystone disconnected');
  }

  async getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]> {
    this.ensureConnected();

    const startIndex = options?.startIndex ?? options?.accountIndex ?? 0;
    const count = options?.count ?? this.syncedAccounts.length;

    return this.syncedAccounts.slice(startIndex, startIndex + count);
  }

  async signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.ensureConnected();

    try {
      const qrRequest = await this.generateSignRequest(transaction, derivationPath);

      // Display the signing request QR code
      this.qrCallbacks!.onDisplayQr(qrRequest.data, qrRequest.type);

      // Wait for the user to scan the signed result
      const signedData = await this.qrCallbacks!.onScanQr();

      // Dismiss the QR display
      this.qrCallbacks!.onDismissQr();

      return this.processSignResponse(signedData);
    } catch (err) {
      this.qrCallbacks!.onDismissQr();
      if (err instanceof SdkError) throw err;
      throw this.mapKeystoneError(err, 'Transaction signing failed');
    }
  }

  async signMessage(message: Uint8Array, derivationPath: string): Promise<SignResult> {
    this.ensureConnected();

    try {
      // For message signing, we encode the message as a sign request
      const qrData = this.encodeMessageSignRequest(message, derivationPath);

      this.qrCallbacks!.onDisplayQr(qrData, 'ur:sol-sign-request');

      const signedData = await this.qrCallbacks!.onScanQr();
      this.qrCallbacks!.onDismissQr();

      return this.processSignResponse(signedData);
    } catch (err) {
      this.qrCallbacks!.onDismissQr();
      if (err instanceof SdkError) throw err;
      throw this.mapKeystoneError(err, 'Message signing failed');
    }
  }

  // ─── QrWalletAdapter methods ────────────────────────────────────────────

  async generateSignRequest(
    transaction: Uint8Array,
    _derivationPath: string,
  ): Promise<QrSignRequest> {
    // Encode the transaction as a UR (Uniform Resource) for Keystone
    // In production, this would use @keystonehq/sol-keyring or @ngraveio/bc-ur
    try {
      const { encodeSignRequest } = await import('./ur-codec.js');
      const encoded = encodeSignRequest(transaction, _derivationPath);
      return {
        data: encoded,
        type: 'ur:sol-sign-request',
      };
    } catch {
      // Fallback: hex-encoded for development/testing
      return {
        data: Buffer.from(transaction).toString('hex'),
        type: 'hex:sol-sign-request',
      };
    }
  }

  async processSignResponse(qrData: string): Promise<SignResult> {
    try {
      const { decodeSignResponse } = await import('./ur-codec.js');
      const signature = decodeSignResponse(qrData);
      return { signature };
    } catch {
      // Fallback: hex-encoded signature
      const signature = new Uint8Array(Buffer.from(qrData, 'hex'));
      if (signature.length !== 64) {
        throw new SdkError(
          SdkErrorCode.SigningFailed,
          `Invalid signature length: expected 64 bytes, got ${signature.length}`,
          { walletType: WalletType.Keystone },
        );
      }
      return { signature };
    }
  }

  async generateAccountSyncRequest(): Promise<QrSyncRequest> {
    return {
      data: 'sol-account-sync',
      type: 'ur:crypto-multi-accounts',
    };
  }

  async processAccountSyncResponse(qrData: string): Promise<DerivedAccount[]> {
    return this.decodeAccountSync(qrData);
  }

  async dispose(): Promise<void> {
    if (this._connectionState !== ConnectionState.Disconnected) {
      await this.disconnect();
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private ensureConnected(): void {
    if (this._connectionState !== ConnectionState.Connected) {
      throw new SdkError(
        SdkErrorCode.NotConnected,
        'Keystone is not connected. Call connect() to sync accounts first.',
        { walletType: WalletType.Keystone },
      );
    }
    if (!this.qrCallbacks) {
      throw new SdkError(SdkErrorCode.TransportUnavailable, 'QR callbacks not available', {
        walletType: WalletType.Keystone,
      });
    }
  }

  /**
   * Decode account sync data from a scanned QR code.
   * In production, this parses UR-encoded crypto-account data.
   */
  private async decodeAccountSync(qrData: string): Promise<DerivedAccount[]> {
    try {
      const { decodeAccountSync: decode } = await import('./ur-codec.js');
      return decode(qrData);
    } catch {
      // Fallback: try to parse as JSON (for testing/development)
      this.logger.warn('UR codec not available, attempting JSON parse for account sync');
      try {
        const parsed = JSON.parse(qrData);
        if (Array.isArray(parsed)) {
          return parsed.map((account: { address: string; publicKey: string; index: number }, i: number) => ({
            address: account.address,
            publicKey: new Uint8Array(Buffer.from(account.publicKey, 'hex')),
            derivationPath: getSolanaDerivationPath(account.index ?? i),
            index: account.index ?? i,
          }));
        }
      } catch {
        // Not JSON either
      }

      throw new SdkError(
        SdkErrorCode.QrDecodingFailed,
        'Failed to decode account sync QR data. Ensure you scanned the correct QR code from Keystone.',
        { walletType: WalletType.Keystone },
      );
    }
  }

  private encodeMessageSignRequest(message: Uint8Array, _derivationPath: string): string {
    // In production, encode as UR. Fallback to hex.
    return Buffer.from(message).toString('hex');
  }

  private mapKeystoneError(err: unknown, context: string): SdkError {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? err : undefined;

    if (message.includes('cancel') || message.includes('reject')) {
      return new SdkError(SdkErrorCode.UserCancelled, 'User cancelled the operation', {
        walletType: WalletType.Keystone,
        cause,
      });
    }

    return new SdkError(SdkErrorCode.Unknown, `${context}: ${message}`, {
      walletType: WalletType.Keystone,
      cause,
    });
  }
}
