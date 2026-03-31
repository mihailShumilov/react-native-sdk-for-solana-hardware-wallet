/**
 * Normalized error codes for the SDK.
 * These provide consistent error handling across all wallet adapters.
 */
export enum SdkErrorCode {
  // Connection errors
  DeviceNotFound = 'DEVICE_NOT_FOUND',
  ConnectionFailed = 'CONNECTION_FAILED',
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  AlreadyConnected = 'ALREADY_CONNECTED',
  NotConnected = 'NOT_CONNECTED',
  Disconnected = 'DISCONNECTED',

  // Transport errors
  TransportUnavailable = 'TRANSPORT_UNAVAILABLE',
  TransportError = 'TRANSPORT_ERROR',
  BluetoothNotAvailable = 'BLUETOOTH_NOT_AVAILABLE',
  UsbNotAvailable = 'USB_NOT_AVAILABLE',
  PermissionDenied = 'PERMISSION_DENIED',

  // Wallet-specific errors
  WalletAppNotOpen = 'WALLET_APP_NOT_OPEN',
  WalletLocked = 'WALLET_LOCKED',
  WalletRejected = 'WALLET_REJECTED',

  // Signing errors
  SigningFailed = 'SIGNING_FAILED',
  UserCancelled = 'USER_CANCELLED',
  InvalidTransaction = 'INVALID_TRANSACTION',
  BlindSigningRequired = 'BLIND_SIGNING_REQUIRED',

  // Derivation errors
  InvalidDerivationPath = 'INVALID_DERIVATION_PATH',
  DerivationFailed = 'DERIVATION_FAILED',

  // Feature errors
  UnsupportedFeature = 'UNSUPPORTED_FEATURE',
  UnsupportedWallet = 'UNSUPPORTED_WALLET',
  UnsupportedTransport = 'UNSUPPORTED_TRANSPORT',

  // QR-specific errors
  QrScanRequired = 'QR_SCAN_REQUIRED',
  QrDecodingFailed = 'QR_DECODING_FAILED',
  QrEncodingFailed = 'QR_ENCODING_FAILED',

  // General
  Timeout = 'TIMEOUT',
  Unknown = 'UNKNOWN',
}

/**
 * Base SDK error class with structured error codes.
 */
export class SdkError extends Error {
  readonly code: SdkErrorCode;
  readonly walletType?: string;
  readonly cause?: Error;

  constructor(
    code: SdkErrorCode,
    message: string,
    options?: { walletType?: string; cause?: Error },
  ) {
    super(message);
    this.name = 'SdkError';
    this.code = code;
    this.walletType = options?.walletType;
    this.cause = options?.cause;
  }

  /** Whether this error represents a user-initiated cancellation */
  get isCancellation(): boolean {
    return this.code === SdkErrorCode.UserCancelled || this.code === SdkErrorCode.WalletRejected;
  }

  /** Whether this error is likely recoverable (e.g., retry or reconnect) */
  get isRecoverable(): boolean {
    return [
      SdkErrorCode.ConnectionTimeout,
      SdkErrorCode.Timeout,
      SdkErrorCode.Disconnected,
      SdkErrorCode.WalletAppNotOpen,
      SdkErrorCode.WalletLocked,
      SdkErrorCode.BlindSigningRequired,
    ].includes(this.code);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      walletType: this.walletType,
    };
  }
}

/**
 * Helper to wrap unknown errors into SdkError.
 */
export function wrapError(err: unknown, walletType?: string): SdkError {
  if (err instanceof SdkError) return err;

  // Handle SdkError from different package instances (instanceof may fail across boundaries)
  if (err instanceof Error && err.name === 'SdkError' && 'code' in err) {
    return new SdkError(
      (err as SdkError).code,
      err.message,
      { walletType: (err as SdkError).walletType ?? walletType, cause: err },
    );
  }

  const cause = err instanceof Error ? err : new Error(String(err));
  return new SdkError(SdkErrorCode.Unknown, cause.message, { walletType, cause });
}
