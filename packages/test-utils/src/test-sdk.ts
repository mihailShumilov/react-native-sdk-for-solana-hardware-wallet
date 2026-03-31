import { createHardwareWalletSdk, type HardwareWalletSdk } from '@solana-hw-wallet/core';
import { MockAdapter, type MockAdapterConfig } from './mock-adapter.js';

/**
 * Create an SDK instance configured with mock adapters for testing.
 */
export function createTestSdk(
  mockConfigs?: MockAdapterConfig[],
): { sdk: HardwareWalletSdk; adapters: MockAdapter[] } {
  const adapters = (mockConfigs ?? [{}]).map((config) => new MockAdapter(config));
  const sdk = createHardwareWalletSdk({ adapters });
  return { sdk, adapters };
}
