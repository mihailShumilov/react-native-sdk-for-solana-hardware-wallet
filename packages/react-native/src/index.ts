// Provider
export { HardwareWalletProvider } from './provider.js';
export type { HardwareWalletProviderProps } from './provider.js';

// Context (for advanced use)
export { HardwareWalletContext, useHardwareWalletContext } from './context.js';

// Hooks
export {
  useWalletDiscovery,
  useWalletConnection,
  useHardwareWallet,
  useDerivedAccounts,
} from './hooks.js';
export type {
  UseWalletDiscoveryResult,
  UseWalletConnectionResult,
  UseHardwareWalletResult,
  UseDerivedAccountsResult,
} from './hooks.js';

// Re-export core types for convenience
export {
  ConnectionState,
  WalletType,
  TransportType,
  SdkErrorCode,
  createHardwareWalletSdk,
} from '@solana-hw-wallet/core';
export type {
  HardwareWalletAdapter,
  HardwareWalletSdkConfig,
  DerivedAccount,
  DerivationOptions,
  DiscoveredDevice,
  SignResult,
  SdkError,
} from '@solana-hw-wallet/core';
