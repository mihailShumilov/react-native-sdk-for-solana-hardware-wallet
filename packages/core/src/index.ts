// Re-export shared types
export {
  WalletType,
  TransportType,
  ConnectionState,
  SdkEvent,
  TypedEventEmitter,
  noopLogger,
} from '@solana-hw-wallet/shared';

export type {
  DiscoveredDevice,
  DerivedAccount,
  DerivationOptions,
  SignResult,
  WalletFeatures,
  SdkEventMap,
  TimeoutOptions,
  Logger,
} from '@solana-hw-wallet/shared';

// Core exports
export type {
  HardwareWalletAdapter,
  QrWalletAdapter,
  QrSignRequest,
  QrSyncRequest,
  AdapterConfig,
} from './adapter.js';
export { isQrAdapter } from './adapter.js';

export { SdkError, SdkErrorCode, wrapError } from './errors.js';

export {
  HardwareWalletSdk,
  createHardwareWalletSdk,
} from './sdk.js';
export type { HardwareWalletSdkConfig } from './sdk.js';
