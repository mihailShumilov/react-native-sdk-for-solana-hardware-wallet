import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  useHardwareWallet,
  useWalletDiscovery,
  ConnectionState,
} from '@solana-hw-wallet/react-native';
import type { DiscoveredDevice } from '@solana-hw-wallet/react-native';

export function WalletScreen() {
  const discovery = useWalletDiscovery();
  const wallet = useHardwareWallet();

  const handleDeviceSelect = useCallback(
    async (device: DiscoveredDevice) => {
      // Use the wallet type as the adapter ID (they match)
      await wallet.connect(device.walletType, device.id);
      if (wallet.isConnected) {
        await wallet.loadAccounts({ count: 3 });
      }
    },
    [wallet],
  );

  const handleSignMessage = useCallback(async () => {
    const message = new TextEncoder().encode('Hello from Solana HW Wallet SDK!');
    const result = await wallet.signMessage(message);
    if (result) {
      Alert.alert('Signed!', `Signature: ${Buffer.from(result.signature).toString('hex').slice(0, 32)}...`);
    }
  }, [wallet]);

  const handleSignTransaction = useCallback(async () => {
    // In production, build a real transaction here
    const mockTxBytes = new Uint8Array(128).fill(0);
    const result = await wallet.signTransaction(mockTxBytes);
    if (result) {
      Alert.alert('Signed!', `Signature: ${Buffer.from(result.signature).toString('hex').slice(0, 32)}...`);
    }
  }, [wallet]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Solana HW Wallet SDK</Text>
      <Text style={styles.subtitle}>Demo Application</Text>

      {/* Discovery Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Discover Devices</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => discovery.discover()}
          disabled={discovery.isDiscovering}
        >
          {discovery.isDiscovering ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Scan for Wallets</Text>
          )}
        </TouchableOpacity>

        {discovery.devices.map((device) => (
          <TouchableOpacity
            key={device.id}
            style={styles.deviceCard}
            onPress={() => handleDeviceSelect(device)}
          >
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceInfo}>
              {device.walletType} via {device.transport}
            </Text>
            {device.model && <Text style={styles.deviceModel}>{device.model}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Connection</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              wallet.isConnected ? styles.statusConnected : styles.statusDisconnected,
            ]}
          />
          <Text style={styles.statusText}>{wallet.connectionState}</Text>
        </View>

        {wallet.isConnected && (
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={wallet.disconnect}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Accounts Section */}
      {wallet.isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Accounts</Text>

          {wallet.isLoadingAccounts && <ActivityIndicator style={styles.loader} />}

          {wallet.accounts.map((account, index) => (
            <TouchableOpacity
              key={account.derivationPath}
              style={[
                styles.accountCard,
                wallet.selectedAccount?.index === account.index && styles.accountSelected,
              ]}
              onPress={() => wallet.selectAccount(index)}
            >
              <Text style={styles.accountPath}>{account.derivationPath}</Text>
              <Text style={styles.accountAddress} numberOfLines={1}>
                {account.address}
              </Text>
            </TouchableOpacity>
          ))}

          {wallet.accounts.length === 0 && !wallet.isLoadingAccounts && (
            <TouchableOpacity
              style={styles.button}
              onPress={() => wallet.loadAccounts({ count: 3 })}
            >
              <Text style={styles.buttonText}>Load Accounts</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Signing Section */}
      {wallet.selectedAccount && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Sign</Text>
          <Text style={styles.selectedInfo}>
            Using: {wallet.selectedAccount.address.slice(0, 8)}...
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={handleSignMessage}
            disabled={wallet.isSigning}
          >
            {wallet.isSigning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign Message</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleSignTransaction}
            disabled={wallet.isSigning}
          >
            <Text style={styles.buttonText}>Sign Transaction</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error Display */}
      {wallet.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{wallet.error.message}</Text>
          <Text style={styles.errorCode}>Code: {wallet.error.code}</Text>
          <TouchableOpacity onPress={wallet.clearError}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonSecondary: { backgroundColor: '#8b5cf6' },
  buttonDanger: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  deviceCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  deviceName: { fontWeight: '600', fontSize: 15 },
  deviceInfo: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  deviceModel: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusConnected: { backgroundColor: '#22c55e' },
  statusDisconnected: { backgroundColor: '#ef4444' },
  statusText: { fontSize: 15, textTransform: 'capitalize' },
  loader: { marginVertical: 12 },
  accountCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  accountSelected: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  accountPath: { fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  accountAddress: { fontSize: 14, fontFamily: 'monospace', marginTop: 4 },
  selectedInfo: { color: '#6b7280', fontSize: 13, marginBottom: 12, fontFamily: 'monospace' },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  errorCode: { color: '#991b1b', fontSize: 12, marginTop: 4, fontFamily: 'monospace' },
  errorDismiss: { color: '#6366f1', marginTop: 8, fontWeight: '600' },
});
