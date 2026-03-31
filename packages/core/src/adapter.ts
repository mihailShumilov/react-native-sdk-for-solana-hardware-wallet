import type {
  ConnectionState,
  DerivedAccount,
  DerivationOptions,
  DiscoveredDevice,
  SignResult,
  TimeoutOptions,
  TransportType,
  WalletFeatures,
  WalletType,
} from '@solana-hw-wallet/shared';

// ─── Adapter Interface ──────────────────────────────────────────────────────

/**
 * The core adapter interface that every hardware wallet adapter must implement.
 *
 * This is the primary extension point of the SDK. Each wallet provides its own
 * implementation of this interface, handling transport-specific communication,
 * account derivation, and signing flows.
 */
export interface HardwareWalletAdapter {
  /** Unique adapter identifier */
  readonly id: string;

  /** Human-readable wallet name */
  readonly name: string;

  /** Wallet type enum value */
  readonly walletType: WalletType;

  /** Transport methods supported by this adapter */
  readonly supportedTransports: TransportType[];

  /** Feature support metadata */
  readonly features: WalletFeatures;

  /** Current connection state */
  readonly connectionState: ConnectionState;

  /**
   * Discover available devices for this wallet type.
   * Returns an array of discovered devices that can be connected to.
   *
   * @param transport - Preferred transport to use for discovery
   * @param options - Timeout options
   */
  discoverDevices(transport?: TransportType, options?: TimeoutOptions): Promise<DiscoveredDevice[]>;

  /**
   * Connect to a specific device.
   *
   * @param deviceId - The device ID from discovery, or undefined for default
   * @param transport - Transport to use for connection
   * @param options - Timeout options
   */
  connect(deviceId?: string, transport?: TransportType, options?: TimeoutOptions): Promise<void>;

  /**
   * Disconnect from the currently connected device.
   */
  disconnect(): Promise<void>;

  /**
   * Derive a Solana public key at the specified derivation path.
   *
   * @param options - Derivation options (index, count, etc.)
   */
  getAccounts(options?: DerivationOptions): Promise<DerivedAccount[]>;

  /**
   * Sign a serialized Solana transaction.
   *
   * @param transaction - The serialized transaction bytes
   * @param derivationPath - The derivation path of the signing account
   */
  signTransaction(transaction: Uint8Array, derivationPath: string): Promise<SignResult>;

  /**
   * Sign an arbitrary message.
   *
   * @param message - The message bytes to sign
   * @param derivationPath - The derivation path of the signing account
   */
  signMessage(message: Uint8Array, derivationPath: string): Promise<SignResult>;

  /**
   * Clean up resources held by the adapter.
   */
  dispose(): Promise<void>;
}

// ─── QR Adapter Extension ───────────────────────────────────────────────────

/**
 * Extended interface for QR-based wallets (Keystone, SafePal).
 *
 * QR wallets don't maintain persistent connections. Instead, they encode
 * signing requests as QR codes and decode signed results from scanned QR codes.
 */
export interface QrWalletAdapter extends HardwareWalletAdapter {
  /**
   * Generate QR data for a signing request.
   * The app should display this as a QR code for the hardware wallet to scan.
   */
  generateSignRequest(transaction: Uint8Array, derivationPath: string): Promise<QrSignRequest>;

  /**
   * Process a scanned QR code containing the signed result.
   */
  processSignResponse(qrData: string): Promise<SignResult>;

  /**
   * Generate QR data for account sync/derivation.
   */
  generateAccountSyncRequest?(): Promise<QrSyncRequest>;

  /**
   * Process a scanned QR code containing account data.
   */
  processAccountSyncResponse?(qrData: string): Promise<DerivedAccount[]>;
}

/** QR data to be displayed as a QR code */
export interface QrSignRequest {
  /** The encoded data (UR-encoded for Keystone, wallet-specific for others) */
  data: string;
  /** Type identifier for the QR format */
  type: string;
}

/** QR data for account sync */
export interface QrSyncRequest {
  data: string;
  type: string;
}

// ─── Adapter Factory ────────────────────────────────────────────────────────

/**
 * Options for creating an adapter instance.
 */
export interface AdapterConfig {
  /** Custom transport implementation to use */
  transport?: unknown;
  /** Logger */
  logger?: import('@solana-hw-wallet/shared').Logger;
}

/**
 * Type guard: check if an adapter supports QR flows.
 */
export function isQrAdapter(adapter: HardwareWalletAdapter): adapter is QrWalletAdapter {
  return 'generateSignRequest' in adapter && 'processSignResponse' in adapter;
}
