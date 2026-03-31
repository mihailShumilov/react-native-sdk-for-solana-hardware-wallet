import React, { useMemo } from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import { createHardwareWalletSdk } from '@solana-hw-wallet/core';
import { LedgerAdapter } from '@solana-hw-wallet/adapter-ledger';
import { KeystoneAdapter } from '@solana-hw-wallet/adapter-keystone';
import { TrezorAdapter } from '@solana-hw-wallet/adapter-trezor';
import { SafePalAdapter } from '@solana-hw-wallet/adapter-safepal';
import { HardwareWalletProvider } from '@solana-hw-wallet/react-native';
import { WalletScreen } from './screens/WalletScreen';

/**
 * Demo React Native app for the Solana Hardware Wallet SDK.
 *
 * This app demonstrates:
 * - Wallet discovery and selection
 * - Device connection
 * - Account derivation and selection
 * - Message signing
 * - Transaction signing
 * - Error handling and loading states
 *
 * NOTE: This is a bare React Native app (not Expo) because:
 * - BLE transport requires native modules (react-native-ble-plx)
 * - USB transport requires native HID modules
 * - NFC requires react-native-nfc-manager
 * Expo does not support these without custom dev clients.
 */
export default function App() {
  const sdk = useMemo(() => {
    return createHardwareWalletSdk({
      adapters: [
        new LedgerAdapter({
          // In production, inject the actual transport:
          // transportFactory: () => TransportBLE.create()
        }),
        new KeystoneAdapter({
          // QR callbacks would be wired to your QR scanner component
        }),
        new TrezorAdapter({
          manifest: {
            email: 'demo@solana-hw-wallet.dev',
            appUrl: 'https://github.com/mihailShumilov/react-native-sdk-for-solana-hardware-wallet',
          },
        }),
        new SafePalAdapter(),
      ],
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <HardwareWalletProvider sdk={sdk}>
        <WalletScreen />
      </HardwareWalletProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});
