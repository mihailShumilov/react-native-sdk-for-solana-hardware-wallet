import { createContext, useContext } from 'react';
import type { HardwareWalletSdk } from '@solana-hw-wallet/core';

export interface HardwareWalletContextValue {
  sdk: HardwareWalletSdk | null;
}

export const HardwareWalletContext = createContext<HardwareWalletContextValue>({ sdk: null });

export function useHardwareWalletContext(): HardwareWalletContextValue {
  const ctx = useContext(HardwareWalletContext);
  if (!ctx.sdk) {
    throw new Error(
      'useHardwareWallet* hooks must be used within a <HardwareWalletProvider>. ' +
        'Wrap your app with <HardwareWalletProvider sdk={sdk}>.',
    );
  }
  return ctx;
}
