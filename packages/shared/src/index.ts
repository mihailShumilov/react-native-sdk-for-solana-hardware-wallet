// ─── Shared Types & Utilities ───────────────────────────────────────────────

/**
 * Supported hardware wallet types.
 */
export enum WalletType {
  Ledger = 'ledger',
  Keystone = 'keystone',
  Trezor = 'trezor',
  SafePal = 'safepal',
}

/**
 * Transport methods used to communicate with hardware wallets.
 */
export enum TransportType {
  BLE = 'ble',
  USB = 'usb',
  QR = 'qr',
  NFC = 'nfc',
}

/**
 * Connection states for a hardware wallet device.
 */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnecting = 'disconnecting',
}

/**
 * Describes a discovered hardware wallet device.
 */
export interface DiscoveredDevice {
  /** Unique device identifier (transport-specific) */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Wallet type */
  walletType: WalletType;
  /** Transport used for this device */
  transport: TransportType;
  /** Optional model information */
  model?: string;
}

/**
 * A derived Solana account from a hardware wallet.
 */
export interface DerivedAccount {
  /** Base58-encoded Solana public key */
  address: string;
  /** Raw public key bytes */
  publicKey: Uint8Array;
  /** BIP44 derivation path used */
  derivationPath: string;
  /** Account index in the derivation */
  index: number;
}

/**
 * Options for deriving accounts.
 */
export interface DerivationOptions {
  /** Account index (default: 0) */
  accountIndex?: number;
  /** Change index (default: 0) */
  changeIndex?: number;
  /** Number of accounts to derive (for multi-account enumeration) */
  count?: number;
  /** Starting index for enumeration (default: 0) */
  startIndex?: number;
}

/**
 * Result of a signing operation.
 */
export interface SignResult {
  /** The signature bytes */
  signature: Uint8Array;
}

/**
 * Features that a wallet adapter may or may not support.
 */
export interface WalletFeatures {
  /** Whether the wallet supports message signing */
  signMessage: boolean;
  /** Whether the wallet supports transaction signing */
  signTransaction: boolean;
  /** Whether the wallet supports versioned transaction signing */
  signVersionedTransaction: boolean;
  /** Whether the wallet supports multi-account derivation */
  multiAccount: boolean;
  /** Whether blind signing is required/supported */
  blindSigning: boolean;
}

/**
 * Event types emitted by the SDK.
 */
export enum SdkEvent {
  DeviceDiscovered = 'device:discovered',
  DeviceRemoved = 'device:removed',
  ConnectionStateChanged = 'connection:stateChanged',
  Error = 'error',
}

/**
 * Typed event map for SDK event emitter.
 */
export interface SdkEventMap {
  [SdkEvent.DeviceDiscovered]: DiscoveredDevice;
  [SdkEvent.DeviceRemoved]: { deviceId: string };
  [SdkEvent.ConnectionStateChanged]: {
    deviceId: string;
    state: ConnectionState;
    previousState: ConnectionState;
  };
  [SdkEvent.Error]: { error: Error; context?: string };
}

// ─── Simple typed event emitter ─────────────────────────────────────────────

export type EventHandler<T> = (data: T) => void;

export class TypedEventEmitter<TEventMap> {
  private listeners = new Map<keyof TEventMap, Set<EventHandler<unknown>>>();

  on<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(handler as EventHandler<unknown>);
    return () => {
      handlers.delete(handler as EventHandler<unknown>);
    };
  }

  off<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch {
        // Swallow listener errors to avoid breaking the emitter chain
      }
    });
  }

  removeAllListeners(event?: keyof TEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// ─── Utility types ──────────────────────────────────────────────────────────

/** Timeout options */
export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/** Logger interface for SDK consumers to plug in their logging */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** No-op logger (default) */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
