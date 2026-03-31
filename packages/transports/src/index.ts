import type { TransportType, TimeoutOptions, Logger } from '@solana-hw-wallet/shared';

// ─── Transport Abstractions ─────────────────────────────────────────────────

/**
 * Abstract transport interface for communicating with hardware wallets.
 *
 * Each transport (BLE, USB, QR, NFC) implements this interface to provide
 * a unified way to send/receive data to/from hardware wallet devices.
 *
 * Note: Not all wallets use streaming transports. QR-based wallets encode
 * entire requests into QR codes, so they implement a higher-level abstraction.
 * This interface is primarily for BLE and USB transports.
 */
export interface Transport {
  /** Transport type */
  readonly type: TransportType;

  /** Whether the transport is currently open */
  readonly isOpen: boolean;

  /** Open the transport connection */
  open(options?: TimeoutOptions): Promise<void>;

  /** Close the transport connection */
  close(): Promise<void>;

  /**
   * Send data and receive a response (request-response pattern).
   * Used by protocols like APDU (Ledger) or Trezor protocol buffers.
   */
  exchange(data: Uint8Array, options?: TimeoutOptions): Promise<Uint8Array>;
}

/**
 * Factory for creating transport instances during device discovery/connection.
 */
export interface TransportFactory {
  /** Transport type this factory creates */
  readonly type: TransportType;

  /** Whether this transport is available on the current platform */
  isAvailable(): Promise<boolean>;

  /**
   * Discover available devices via this transport.
   * Returns device descriptors (not connected transports).
   */
  discover(options?: TimeoutOptions): Promise<TransportDeviceDescriptor[]>;

  /**
   * Create a transport connected to a specific device.
   */
  create(deviceId: string, options?: TimeoutOptions): Promise<Transport>;
}

/**
 * Descriptor for a device found during transport-level discovery.
 */
export interface TransportDeviceDescriptor {
  /** Transport-specific device identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Transport type */
  transport: TransportType;
}

// ─── BLE Transport Types ────────────────────────────────────────────────────

/**
 * BLE-specific transport configuration.
 *
 * On React Native, BLE requires:
 * - iOS: Bluetooth permission in Info.plist
 * - Android: BLUETOOTH_SCAN, BLUETOOTH_CONNECT permissions
 *
 * Libraries: react-native-ble-plx or @ledgerhq/react-native-hw-transport-ble
 */
export interface BleTransportConfig {
  /** Service UUIDs to scan for (wallet-specific) */
  serviceUuids?: string[];
  /** Scan duration in milliseconds */
  scanDurationMs?: number;
}

// ─── USB Transport Types ────────────────────────────────────────────────────

/**
 * USB transport configuration.
 *
 * On React Native, USB HID requires native modules.
 * On Node.js, node-hid or @ledgerhq/hw-transport-node-hid can be used.
 *
 * Note: USB OTG on Android requires specific manifest permissions.
 */
export interface UsbTransportConfig {
  /** Vendor IDs to filter for */
  vendorIds?: number[];
  /** Product IDs to filter for */
  productIds?: number[];
}

// ─── QR Transport Types ────────────────────────────────────────────────────

/**
 * QR "transport" abstraction.
 *
 * QR-based wallets don't use traditional transports. Instead:
 * 1. SDK encodes a request into QR data
 * 2. App displays the QR code
 * 3. User scans the QR with the hardware wallet
 * 4. Hardware wallet displays a signed QR
 * 5. User scans the signed QR with the app
 * 6. SDK decodes the signed result
 *
 * This interface captures the app-side callbacks needed for the flow.
 */
export interface QrTransportCallbacks {
  /**
   * Called when the SDK needs to display QR data to the user.
   * The app should render this as a QR code.
   *
   * @param data - The data to encode in a QR code
   * @param type - The type/format of the QR data (e.g., 'ur:sol-sign-request')
   */
  onDisplayQr(data: string, type: string): void;

  /**
   * Called when the SDK needs the user to scan a QR code.
   * The app should open a QR scanner and return the scanned data.
   *
   * @returns The scanned QR code data
   */
  onScanQr(): Promise<string>;

  /**
   * Called to dismiss any displayed QR code.
   */
  onDismissQr(): void;
}

// ─── NFC Transport Types ────────────────────────────────────────────────────

/**
 * NFC transport configuration.
 *
 * Used by Tangem cards. Requires:
 * - iOS: Near Field Communication Tag Reading capability
 * - Android: NFC permission in manifest
 *
 * Libraries: react-native-nfc-manager
 */
export interface NfcTransportConfig {
  /** NFC technology to use */
  technology?: string;
}

// ─── Transport Logger ───────────────────────────────────────────────────────

export interface TransportOptions {
  logger?: Logger;
}
