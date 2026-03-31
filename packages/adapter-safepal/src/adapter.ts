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
 * Configuration for the SafePal adapter.
 */
export interface SafePalAdapterConfig {
  /**
   * Callbacks for QR code display and scanning.
   */
  qrCallbacks?: QrTransportCallbacks;

  /** Logger */
  logger?: Logger;
}

/**
 * SafePal hardware wallet adapter (QR-based).
 *
 * SafePal S1 uses QR codes for air-gapped communication, similar to Keystone.
 * However, SafePal uses a proprietary QR encoding format rather than the
 * Blockchain Commons UR standard.
 *
 * STATUS: PARTIAL IMPLEMENTATION
 *
 * SafePal does not publish a comprehensive public SDK for third-party integration
 * with their hardware wallet's QR protocol. The SafePal app handles most of the
 * QR encoding/decoding internally.
 *
 * What works:
 * - Adapter contract implementation
 * - Connection lifecycle
 * - QR display/scan flow structure
 *
 * What needs work:
 * - SafePal's proprietary QR encoding format is not publicly documented
 * - Transaction serialization format for SafePal QR is unclear
 * - Account sync QR format is proprietary
 *
 * TODO: Reverse-engineer or obtain documentation for SafePal's QR protocol.
 * TODO: Alternatively, SafePal may offer a mobile SDK for direct integration.
 *
 * For now, the adapter demonstrates the correct architecture and can be
 * completed when SafePal publishes their QR protocol specifications.
 */
export class SafePalAdapter implements QrWalletAdapter {
  readonly id = 'safepal';
  readonly name = 'SafePal';
  readonly walletType = WalletType.SafePal;
  readonly supportedTransports = [TransportType.QR];
  readonly features: WalletFeatures = {
    signMessage: false, // Unknown — protocol not documented
    signTransaction: true, // Partial — QR format needs documentation
    signVersionedTransaction: false, // Unknown
    multiAccount: true,
    blindSigning: false,
  };

  private _connectionState = ConnectionState.Disconnected;
  private qrCallbacks: QrTransportCallbacks | null = null;
  private logger: Logger;
  private syncedAccounts: DerivedAccount[] = [];

  constructor(config: SafePalAdapterConfig = {}) {
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
    return [
      {
        id: 'safepal-qr',
        name: 'SafePal (QR)',
        walletType: WalletType.SafePal,
        transport: TransportType.QR,
        model: 'SafePal S1',
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
        'QR callbacks not provided. Pass qrCallbacks in the adapter config.',
        { walletType: WalletType.SafePal },
      );
    }

    this._connectionState = ConnectionState.Connecting;

    try {
      const scannedData = await this.qrCallbacks.onScanQr();
      const accounts = this.decodeAccountSync(scannedData);

      if (accounts.length === 0) {
        throw new SdkError(
          SdkErrorCode.DerivationFailed,
          'No Solana accounts found in the SafePal QR code.',
          { walletType: WalletType.SafePal },
        );
      }

      this.syncedAccounts = accounts;
      this._connectionState = ConnectionState.Connected;
      this.logger.info(`SafePal connected with ${accounts.length} account(s)`);
    } catch (err) {
      this._connectionState = ConnectionState.Disconnected;
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.SafePal);
    }
  }

  async disconnect(): Promise<void> {
    this.syncedAccounts = [];
    this._connectionState = ConnectionState.Disconnected;
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
      this.qrCallbacks!.onDisplayQr(qrRequest.data, qrRequest.type);
      const signedData = await this.qrCallbacks!.onScanQr();
      this.qrCallbacks!.onDismissQr();
      return this.processSignResponse(signedData);
    } catch (err) {
      this.qrCallbacks?.onDismissQr();
      if (err instanceof SdkError) throw err;
      throw wrapError(err, WalletType.SafePal);
    }
  }

  async signMessage(_message: Uint8Array, _derivationPath: string): Promise<SignResult> {
    throw new SdkError(
      SdkErrorCode.UnsupportedFeature,
      'SafePal message signing is not yet supported. The QR protocol for message signing is not publicly documented.',
      { walletType: WalletType.SafePal },
    );
  }

  // ─── QrWalletAdapter methods ────────────────────────────────────────────

  async generateSignRequest(
    transaction: Uint8Array,
    derivationPath: string,
  ): Promise<QrSignRequest> {
    // TODO: Implement SafePal's proprietary QR encoding
    // SafePal uses a custom format, not UR standard
    const payload = JSON.stringify({
      type: 'safepal-sol-sign',
      transaction: Buffer.from(transaction).toString('hex'),
      derivationPath,
    });

    return {
      data: payload,
      type: 'safepal:sol-sign-request',
    };
  }

  async processSignResponse(qrData: string): Promise<SignResult> {
    // TODO: Implement SafePal's proprietary QR decoding
    try {
      const parsed = JSON.parse(qrData);
      if (parsed.signature) {
        return { signature: new Uint8Array(Buffer.from(parsed.signature, 'hex')) };
      }
    } catch {
      // Try direct hex
    }

    const signature = new Uint8Array(Buffer.from(qrData, 'hex'));
    if (signature.length !== 64) {
      throw new SdkError(
        SdkErrorCode.SigningFailed,
        `Invalid SafePal signature: expected 64 bytes, got ${signature.length}`,
        { walletType: WalletType.SafePal },
      );
    }
    return { signature };
  }

  async generateAccountSyncRequest(): Promise<QrSyncRequest> {
    return {
      data: 'safepal-sol-account-sync',
      type: 'safepal:account-sync',
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

  // ─── Private ──────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (this._connectionState !== ConnectionState.Connected) {
      throw new SdkError(SdkErrorCode.NotConnected, 'SafePal is not connected.', {
        walletType: WalletType.SafePal,
      });
    }
    if (!this.qrCallbacks) {
      throw new SdkError(SdkErrorCode.TransportUnavailable, 'QR callbacks not available', {
        walletType: WalletType.SafePal,
      });
    }
  }

  /**
   * Decode account data from SafePal QR.
   * TODO: Implement SafePal's proprietary format.
   */
  private decodeAccountSync(qrData: string): DerivedAccount[] {
    try {
      const parsed = JSON.parse(qrData);
      if (Array.isArray(parsed.accounts || parsed)) {
        const accounts = parsed.accounts || parsed;
        return accounts.map(
          (account: { address: string; publicKey: string; index?: number }, i: number) => ({
            address: account.address,
            publicKey: new Uint8Array(Buffer.from(account.publicKey, 'hex')),
            derivationPath: getSolanaDerivationPath(account.index ?? i),
            index: account.index ?? i,
          }),
        );
      }
    } catch {
      // Not JSON
    }

    throw new SdkError(
      SdkErrorCode.QrDecodingFailed,
      'Failed to decode SafePal account QR data. SafePal QR protocol support is partial.',
      { walletType: WalletType.SafePal },
    );
  }
}
