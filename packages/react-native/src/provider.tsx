import React, { useMemo } from 'react';
import type { HardwareWalletSdk } from '@solana-hw-wallet/core';
import { HardwareWalletContext } from './context.js';

export interface HardwareWalletProviderProps {
  sdk: HardwareWalletSdk;
  children: React.ReactNode;
}

/**
 * Provider component that makes the SDK available to all child hooks.
 *
 * @example
 * ```tsx
 * const sdk = createHardwareWalletSdk({ adapters: [new LedgerAdapter()] });
 *
 * function App() {
 *   return (
 *     <HardwareWalletProvider sdk={sdk}>
 *       <YourApp />
 *     </HardwareWalletProvider>
 *   );
 * }
 * ```
 */
export function HardwareWalletProvider({ sdk, children }: HardwareWalletProviderProps) {
  const value = useMemo(() => ({ sdk }), [sdk]);
  return (
    <HardwareWalletContext.Provider value={value}>{children}</HardwareWalletContext.Provider>
  );
}
