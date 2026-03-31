# Solana Hardware Wallet SDK for React Native

A unified, open-source React Native SDK that enables Solana dApps to connect to and interact with multiple hardware wallets through one consistent API.

## Supported Wallets

| Wallet | Transport | Status | Sign Tx | Sign Msg | Multi-Account |
|--------|-----------|--------|---------|----------|---------------|
| Ledger | BLE, USB | **Full** | Yes | Yes (>= v1.3.0) | Yes |
| Keystone | QR | **Full** | Yes | Yes | Yes |
| Trezor | USB | **Full** | Yes | No* | Yes |
| SafePal | QR | **Partial** | Partial** | No | Yes |

\* Trezor Solana message signing is limited to certain models/firmware. Transaction signing works fully.
\** SafePal QR protocol is proprietary and not publicly documented. Adapter contract is complete but encoding/decoding needs protocol specs.

## Architecture

```mermaid
graph TB
    App[React Native App] --> RN[@solana-hw-wallet/react-native]
    App --> SDK[@solana-hw-wallet/core]
    RN --> SDK
    SDK --> AL[adapter-ledger]
    SDK --> AK[adapter-keystone]
    SDK --> AT[adapter-trezor]
    SDK --> AS[adapter-safepal]
    AL --> SOL[@solana-hw-wallet/solana]
    AK --> SOL
    AT --> SOL
    AS --> SOL
    AL --> TR[@solana-hw-wallet/transports]
    AK --> TR
    SDK --> SH[@solana-hw-wallet/shared]
```

### Key Design Principles

- **Adapter pattern**: Each wallet is a pluggable adapter behind a shared `HardwareWalletAdapter` interface
- **Transport-agnostic**: Public SDK API doesn't expose transport details
- **Strongly typed**: Full TypeScript with strict mode
- **QR-first for air-gapped wallets**: Extended `QrWalletAdapter` interface for Keystone/SafePal
- **Testable**: Mock adapter included for testing without hardware

## Monorepo Structure

```
/packages
  /shared          # Shared types, enums, event emitter
  /core            # Adapter interfaces, SDK class, errors
  /solana          # Derivation paths, transaction helpers
  /transports      # Transport abstractions (BLE, USB, QR, NFC)
  /adapter-ledger  # Ledger wallet adapter
  /adapter-keystone # Keystone wallet adapter (QR)
  /adapter-trezor  # Trezor wallet adapter
  /adapter-safepal # SafePal wallet adapter (QR, partial)
  /react-native    # React Native hooks & provider
  /test-utils      # Mock adapter for testing

/apps
  /demo-react-native  # Demo React Native app
  /examples-node      # Node.js example scripts

/docs
  /architecture    # Architecture documentation
  /wallets         # Per-wallet documentation
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- React Native >= 0.72 (bare, not Expo — BLE/USB/NFC require native modules)

### Installation

```bash
# Install core SDK
npm install @solana-hw-wallet/core @solana-hw-wallet/solana

# Install React Native hooks
npm install @solana-hw-wallet/react-native

# Install wallet adapters you need
npm install @solana-hw-wallet/adapter-ledger
npm install @solana-hw-wallet/adapter-keystone
npm install @solana-hw-wallet/adapter-trezor
npm install @solana-hw-wallet/adapter-safepal
```

### Development Setup

```bash
git clone https://github.com/mihailShumilov/react-native-sdk-for-solana-hardware-wallet.git
cd react-native-sdk-for-solana-hardware-wallet
pnpm install
pnpm build
pnpm test
```

### Run Node.js Examples

These use a mock adapter so no hardware device is required:

```bash
# Derive accounts
pnpm --filter @solana-hw-wallet/examples-node example:derive

# Sign a message
pnpm --filter @solana-hw-wallet/examples-node example:sign-message

# Sign a transaction
pnpm --filter @solana-hw-wallet/examples-node example:sign-transaction
```

### Run React Native Demo App

**Prerequisites:**
- Xcode (iOS) or Android Studio (Android)
- CocoaPods (`gem install cocoapods`)
- A physical device is recommended (BLE doesn't work in simulators)

```bash
# 1. Build all SDK packages first
pnpm build

# 2. Install iOS native dependencies
cd apps/demo-react-native/ios
pod install
cd ..

# 3a. Run on iOS
npx react-native run-ios

# 3b. Or run on Android
npx react-native run-android
```

**Starting Metro bundler separately** (useful for debugging):

```bash
cd apps/demo-react-native
npx react-native start --reset-cache
```

**Notes:**
- The demo app includes all 4 wallet adapters (Ledger, Keystone, Trezor, SafePal)
- BLE scanning requires a physical device — iOS Simulator does not support Bluetooth
- QR-based wallets (Keystone, SafePal) require camera access
- Trezor requires Trezor Bridge running on desktop
- See `apps/demo-react-native/` for the full source

## API Reference

### Core SDK

```typescript
import { createHardwareWalletSdk } from '@solana-hw-wallet/core';
import { LedgerAdapter } from '@solana-hw-wallet/adapter-ledger';

// Create SDK with adapters
const sdk = createHardwareWalletSdk({
  adapters: [new LedgerAdapter({ transportFactory: () => TransportBLE.create() })],
});

// Discover devices
const devices = await sdk.discoverDevices();

// Connect
await sdk.connect('ledger', devices[0].id);

// Derive accounts
const accounts = await sdk.getAccounts({ count: 5 });
const account = await sdk.getPublicKey(0);

// Sign transaction
const { signature } = await sdk.signTransaction(serializedTx, account.derivationPath);

// Sign message
const { signature: msgSig } = await sdk.signMessage(messageBytes, account.derivationPath);

// Disconnect
await sdk.disconnect();

// Clean up
await sdk.dispose();
```

### React Native Hooks

```tsx
import {
  HardwareWalletProvider,
  createHardwareWalletSdk,
  useHardwareWallet,
  useWalletDiscovery,
  useWalletConnection,
  useDerivedAccounts,
} from '@solana-hw-wallet/react-native';

// Wrap your app
function App() {
  const sdk = useMemo(() => createHardwareWalletSdk({ adapters: [...] }), []);
  return (
    <HardwareWalletProvider sdk={sdk}>
      <YourApp />
    </HardwareWalletProvider>
  );
}

// Use hooks in components
function WalletScreen() {
  const {
    isConnected,
    connect,
    disconnect,
    accounts,
    loadAccounts,
    selectedAccount,
    selectAccount,
    signTransaction,
    signMessage,
    isSigning,
    error,
    clearError,
  } = useHardwareWallet();

  // Or use individual hooks:
  const { devices, discover, isDiscovering } = useWalletDiscovery();
  const { connectionState, connect, disconnect } = useWalletConnection();
  const { accounts, isLoading, refresh } = useDerivedAccounts(true, { count: 3 });
}
```

### Solana Helpers

```typescript
import {
  getSolanaDerivationPath,
  getSolanaDerivationPaths,
  parseSolanaDerivationPath,
  serializeTransaction,
  addSignatureToTransaction,
} from '@solana-hw-wallet/solana';

// Derivation paths
getSolanaDerivationPath(0);       // "m/44'/501'/0'/0'"
getSolanaDerivationPath(2, 1);    // "m/44'/501'/2'/1'"
getSolanaDerivationPaths(5);      // array of 5 paths

// Transaction helpers
const message = serializeTransaction(transaction);
const signed = addSignatureToTransaction(transaction, publicKey, signature);
```

### Error Handling

```typescript
import { SdkError, SdkErrorCode } from '@solana-hw-wallet/core';

try {
  await sdk.signTransaction(tx, path);
} catch (err) {
  if (err instanceof SdkError) {
    switch (err.code) {
      case SdkErrorCode.UserCancelled:
        console.log('User rejected on device');
        break;
      case SdkErrorCode.WalletAppNotOpen:
        console.log('Please open the Solana app');
        break;
      case SdkErrorCode.BlindSigningRequired:
        console.log('Enable blind signing in wallet settings');
        break;
      case SdkErrorCode.NotConnected:
        console.log('Wallet disconnected');
        break;
    }

    // Helper properties
    err.isCancellation;  // true for user cancellations
    err.isRecoverable;   // true for timeout, disconnected, etc.
    err.walletType;      // which wallet caused the error
  }
}
```

### Events

```typescript
import { SdkEvent } from '@solana-hw-wallet/core';

sdk.on(SdkEvent.DeviceDiscovered, (device) => { ... });
sdk.on(SdkEvent.ConnectionStateChanged, ({ state, previousState, deviceId }) => { ... });
sdk.on(SdkEvent.Error, ({ error, context }) => { ... });
```

## Per-Wallet Setup Notes

### Ledger
- **Requires**: Solana app installed and open on device
- **BLE**: Requires Bluetooth permissions (iOS Info.plist, Android manifest)
- **Blind signing**: Must be enabled in Solana app settings for complex transactions
- **Message signing**: Requires Ledger Solana app >= 1.3.0
- **Transport**: Inject `@ledgerhq/react-native-hw-transport-ble` for mobile

### Keystone
- **QR-based**: Air-gapped, no persistent connection
- **Requires**: Camera permission for QR scanning
- **App must provide**: QR display and scanner UI via `qrCallbacks`
- **Protocol**: Uses UR (Uniform Resource) standard

### Trezor
- **USB only**: BLE not supported by Trezor
- **Requires**: `@trezor/connect` package, Trezor Bridge on desktop
- **React Native**: Needs WebView bridge approach (not native USB)
- **No message signing**: Solana message signing is unsupported on most models

### SafePal
- **QR-based**: Proprietary protocol (not UR standard)
- **Status**: Partial implementation
- **Blocked**: QR encoding/decoding protocol not publicly documented

## Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @solana-hw-wallet/core test
pnpm --filter @solana-hw-wallet/solana test
pnpm --filter @solana-hw-wallet/test-utils test
```

### Test Coverage

| Package | Tests | Description |
|---------|-------|-------------|
| core | 28 | SDK lifecycle, connection, signing, errors |
| solana | 13 | Derivation paths, parsing, buffer conversion |
| test-utils | 8 | Mock adapter behaviors, call recording |

### Testing with Hardware

For integration testing with real hardware:

1. **Ledger**: Connect via BLE, ensure Solana app is open
2. **Keystone**: Use QR codes with device camera
3. **Trezor**: Connect via USB, ensure Trezor Bridge is running

See `docs/wallets/` for per-wallet testing guides.

### Mock Adapter

Use `MockAdapter` from `@solana-hw-wallet/test-utils` for development and testing:

```typescript
import { MockAdapter, createTestSdk } from '@solana-hw-wallet/test-utils';

const { sdk, adapters } = createTestSdk();
await sdk.connect('mock');

// Simulate behaviors
adapters[0].setBehavior({ rejectSigning: true });
adapters[0].setBehavior({ delayMs: 2000 }); // simulate latency
```

## Development

### Build

```bash
pnpm build        # Build all packages
pnpm dev          # Watch mode
pnpm typecheck    # Type checking
pnpm lint         # ESLint
pnpm clean        # Clean all dist folders
```

### Package Publishing

Each package is independently publishable with:
- Proper `exports` field
- TypeScript declarations
- ESM and CJS builds
- Source maps

## Troubleshooting

**Q: BLE discovery doesn't find my Ledger**
Ensure Bluetooth is enabled, device is in pairing mode, and the Solana app is open. On Android, BLUETOOTH_SCAN and BLUETOOTH_CONNECT permissions are required.

**Q: "Solana app not open" error**
Open the Solana app on your hardware wallet before connecting. Some wallets default to the dashboard.

**Q: "Blind signing required" error**
In the Solana app settings on your Ledger, enable "Allow blind signing". This is needed for complex transactions.

**Q: Trezor not detected**
Ensure Trezor Bridge is installed and running (desktop). For React Native, a WebView bridge is needed.

**Q: Keystone QR code not recognized**
Ensure you're scanning the correct QR code type. Account sync and signing use different QR formats.

## Limitations & Future Work

- **SafePal**: Waiting for public protocol documentation
- **Expo**: Not supported — BLE/USB/NFC require native modules. Use bare React Native.
- **Versioned transactions**: Fully supported in the type system, but hardware wallet firmware may lag
- **Multi-sig**: Not currently implemented (individual account signing only)
- **Bonus wallets**: Tangem (NFC), Unruggable, Solflare Shield could be added as additional adapters

## License

MIT

## Contributing

Contributions welcome! Please:
1. Follow the adapter pattern for new wallet implementations
2. Add tests for new functionality
3. Update documentation
4. Keep packages publishable
