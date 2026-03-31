import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ConnectionState,
  SdkEvent,
  type DerivedAccount,
  type DerivationOptions,
  type DiscoveredDevice,
  type SignResult,
  type TransportType,
} from '@solana-hw-wallet/core';
import type { SdkError } from '@solana-hw-wallet/core';
import { useHardwareWalletContext } from './context.js';

// ─── useWalletDiscovery ─────────────────────────────────────────────────────

export interface UseWalletDiscoveryResult {
  devices: DiscoveredDevice[];
  isDiscovering: boolean;
  error: SdkError | null;
  discover: (adapterId?: string, transport?: TransportType) => Promise<void>;
  clearDevices: () => void;
}

/**
 * Hook for discovering hardware wallet devices.
 *
 * @example
 * ```tsx
 * function DiscoveryScreen() {
 *   const { devices, isDiscovering, discover, error } = useWalletDiscovery();
 *
 *   return (
 *     <View>
 *       <Button title="Scan" onPress={() => discover()} />
 *       {isDiscovering && <ActivityIndicator />}
 *       {devices.map(d => <Text key={d.id}>{d.name}</Text>)}
 *       {error && <Text style={{ color: 'red' }}>{error.message}</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
export function useWalletDiscovery(): UseWalletDiscoveryResult {
  const { sdk } = useHardwareWalletContext();
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<SdkError | null>(null);

  useEffect(() => {
    if (!sdk) return;
    const unsub = sdk.on(SdkEvent.DeviceDiscovered, (device) => {
      setDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [...prev, device];
      });
    });
    return unsub;
  }, [sdk]);

  const discover = useCallback(
    async (adapterId?: string, transport?: TransportType) => {
      if (!sdk) return;
      setIsDiscovering(true);
      setError(null);
      try {
        const found = await sdk.discoverDevices(adapterId, transport);
        setDevices(found);
      } catch (err) {
        setError(err as SdkError);
      } finally {
        setIsDiscovering(false);
      }
    },
    [sdk],
  );

  const clearDevices = useCallback(() => setDevices([]), []);

  return { devices, isDiscovering, error, discover, clearDevices };
}

// ─── useWalletConnection ────────────────────────────────────────────────────

export interface UseWalletConnectionResult {
  connectionState: ConnectionState;
  isConnecting: boolean;
  isConnected: boolean;
  error: SdkError | null;
  connect: (adapterId: string, deviceId?: string, transport?: TransportType) => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Hook for managing hardware wallet connection lifecycle.
 *
 * @example
 * ```tsx
 * function ConnectScreen() {
 *   const { connectionState, isConnecting, connect, disconnect, error } = useWalletConnection();
 *
 *   return (
 *     <View>
 *       <Text>Status: {connectionState}</Text>
 *       <Button title="Connect Ledger" onPress={() => connect('ledger')} />
 *       <Button title="Disconnect" onPress={disconnect} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useWalletConnection(): UseWalletConnectionResult {
  const { sdk } = useHardwareWalletContext();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [error, setError] = useState<SdkError | null>(null);

  useEffect(() => {
    if (!sdk) return;
    const unsub = sdk.on(SdkEvent.ConnectionStateChanged, ({ state }) => {
      setConnectionState(state);
    });
    return unsub;
  }, [sdk]);

  const connect = useCallback(
    async (adapterId: string, deviceId?: string, transport?: TransportType) => {
      if (!sdk) return;
      setError(null);
      try {
        await sdk.connect(adapterId, deviceId, transport);
      } catch (err) {
        setError(err as SdkError);
      }
    },
    [sdk],
  );

  const disconnect = useCallback(async () => {
    if (!sdk) return;
    setError(null);
    try {
      await sdk.disconnect();
    } catch (err) {
      setError(err as SdkError);
    }
  }, [sdk]);

  return {
    connectionState,
    isConnecting: connectionState === ConnectionState.Connecting,
    isConnected: connectionState === ConnectionState.Connected,
    error,
    connect,
    disconnect,
  };
}

// ─── useHardwareWallet ──────────────────────────────────────────────────────

export interface UseHardwareWalletResult {
  // Connection
  connectionState: ConnectionState;
  isConnected: boolean;
  connect: (adapterId: string, deviceId?: string, transport?: TransportType) => Promise<void>;
  disconnect: () => Promise<void>;

  // Accounts
  accounts: DerivedAccount[];
  selectedAccount: DerivedAccount | null;
  isLoadingAccounts: boolean;
  loadAccounts: (options?: DerivationOptions) => Promise<void>;
  selectAccount: (index: number) => void;

  // Signing
  isSigning: boolean;
  signTransaction: (transaction: Uint8Array) => Promise<SignResult | null>;
  signMessage: (message: Uint8Array) => Promise<SignResult | null>;

  // Errors
  error: SdkError | null;
  clearError: () => void;
}

/**
 * All-in-one hook for hardware wallet interaction.
 * Combines discovery, connection, accounts, and signing into a single hook.
 *
 * @example
 * ```tsx
 * function WalletScreen() {
 *   const {
 *     isConnected, connect, disconnect,
 *     accounts, loadAccounts, selectedAccount, selectAccount,
 *     signTransaction, isSigning, error,
 *   } = useHardwareWallet();
 *
 *   // ... render UI
 * }
 * ```
 */
export function useHardwareWallet(): UseHardwareWalletResult {
  const { sdk } = useHardwareWalletContext();
  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected);
  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<SdkError | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sdk) return;
    const unsub = sdk.on(SdkEvent.ConnectionStateChanged, ({ state }) => {
      if (mountedRef.current) {
        setConnectionState(state);
        if (state === ConnectionState.Disconnected) {
          setAccounts([]);
          setSelectedAccountIndex(0);
        }
      }
    });
    return unsub;
  }, [sdk]);

  const connect = useCallback(
    async (adapterId: string, deviceId?: string, transport?: TransportType) => {
      if (!sdk) return;
      setError(null);
      try {
        await sdk.connect(adapterId, deviceId, transport);
      } catch (err) {
        if (mountedRef.current) setError(err as SdkError);
      }
    },
    [sdk],
  );

  const disconnect = useCallback(async () => {
    if (!sdk) return;
    try {
      await sdk.disconnect();
    } catch (err) {
      if (mountedRef.current) setError(err as SdkError);
    }
  }, [sdk]);

  const loadAccounts = useCallback(
    async (options?: DerivationOptions) => {
      if (!sdk) return;
      setIsLoadingAccounts(true);
      setError(null);
      try {
        const derived = await sdk.getAccounts(options);
        if (mountedRef.current) setAccounts(derived);
      } catch (err) {
        if (mountedRef.current) setError(err as SdkError);
      } finally {
        if (mountedRef.current) setIsLoadingAccounts(false);
      }
    },
    [sdk],
  );

  const selectAccount = useCallback(
    (index: number) => {
      if (index >= 0 && index < accounts.length) {
        setSelectedAccountIndex(index);
      }
    },
    [accounts.length],
  );

  const selectedAccount = accounts[selectedAccountIndex] ?? null;

  const signTransaction = useCallback(
    async (transaction: Uint8Array): Promise<SignResult | null> => {
      if (!sdk || !selectedAccount) return null;
      setIsSigning(true);
      setError(null);
      try {
        const result = await sdk.signTransaction(transaction, selectedAccount.derivationPath);
        return result;
      } catch (err) {
        if (mountedRef.current) setError(err as SdkError);
        return null;
      } finally {
        if (mountedRef.current) setIsSigning(false);
      }
    },
    [sdk, selectedAccount],
  );

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<SignResult | null> => {
      if (!sdk || !selectedAccount) return null;
      setIsSigning(true);
      setError(null);
      try {
        const result = await sdk.signMessage(message, selectedAccount.derivationPath);
        return result;
      } catch (err) {
        if (mountedRef.current) setError(err as SdkError);
        return null;
      } finally {
        if (mountedRef.current) setIsSigning(false);
      }
    },
    [sdk, selectedAccount],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    connectionState,
    isConnected: connectionState === ConnectionState.Connected,
    connect,
    disconnect,
    accounts,
    selectedAccount,
    isLoadingAccounts,
    loadAccounts,
    selectAccount,
    isSigning,
    signTransaction,
    signMessage,
    error,
    clearError,
  };
}

// ─── useDerivedAccounts ─────────────────────────────────────────────────────

export interface UseDerivedAccountsResult {
  accounts: DerivedAccount[];
  isLoading: boolean;
  error: SdkError | null;
  refresh: (options?: DerivationOptions) => Promise<void>;
}

/**
 * Hook specifically for account derivation.
 *
 * @param autoLoad - Whether to automatically load accounts when connected (default: true)
 * @param options - Default derivation options
 */
export function useDerivedAccounts(
  autoLoad = true,
  options?: DerivationOptions,
): UseDerivedAccountsResult {
  const { sdk } = useHardwareWalletContext();
  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<SdkError | null>(null);

  const refresh = useCallback(
    async (overrideOptions?: DerivationOptions) => {
      if (!sdk) return;
      setIsLoading(true);
      setError(null);
      try {
        const derived = await sdk.getAccounts(overrideOptions ?? options);
        setAccounts(derived);
      } catch (err) {
        setError(err as SdkError);
      } finally {
        setIsLoading(false);
      }
    },
    [sdk, options],
  );

  useEffect(() => {
    if (!sdk || !autoLoad) return;
    const unsub = sdk.on(SdkEvent.ConnectionStateChanged, ({ state }) => {
      if (state === ConnectionState.Connected) {
        refresh();
      } else if (state === ConnectionState.Disconnected) {
        setAccounts([]);
      }
    });
    return unsub;
  }, [sdk, autoLoad, refresh]);

  return { accounts, isLoading, error, refresh };
}
