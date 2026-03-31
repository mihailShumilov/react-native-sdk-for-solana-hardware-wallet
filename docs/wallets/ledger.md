# Ledger Wallet Adapter

**Package:** `@solana-hw-wallet/adapter-ledger`
**Adapter class:** `LedgerAdapter`
**Wallet type:** `WalletType.Ledger`
**Implementation status:** Fully implemented

---

## Transport Methods

The Ledger adapter supports two transport methods:

| Transport | Enum | Use Case | Library |
|-----------|------|----------|---------|
| BLE | `TransportType.BLE` | React Native (iOS/Android), Web BLE | `@ledgerhq/react-native-hw-transport-ble` or `@ledgerhq/hw-transport-web-ble` |
| USB | `TransportType.USB` | Desktop / Node.js | `@ledgerhq/hw-transport-node-hid` |

The adapter is transport-agnostic: you inject a transport instance or factory via `LedgerAdapterConfig`. This means the adapter itself does not depend on any specific Ledger transport package at runtime -- you choose which one to install based on your platform.

---

## Setup Prerequisites

### Firmware and App Requirements

- **Ledger firmware:** Up to date (Nano S Plus, Nano X, or Stax recommended)
- **Solana app:** Must be installed via Ledger Live and **open on the device** before calling `connect()`
- **Solana app version >= 1.3.0:** Required for off-chain message signing (`signOffchainMessage`). Older versions only support transaction signing.
- **Blind signing:** Must be enabled in the Solana app settings on the Ledger device for certain complex transactions (e.g., transactions with unrecognized instructions)

### NPM Dependencies

```
# Required
pnpm add @solana-hw-wallet/adapter-ledger
pnpm add @ledgerhq/hw-app-solana @ledgerhq/hw-transport

# Pick ONE transport based on your platform:
pnpm add @ledgerhq/react-native-hw-transport-ble   # React Native BLE
pnpm add @ledgerhq/hw-transport-web-ble             # Web BLE
pnpm add @ledgerhq/hw-transport-node-hid            # Node.js USB
```

`@ledgerhq/hw-app-solana` is dynamically imported during `connect()`. If the import fails, the adapter throws `SdkErrorCode.WalletAppNotOpen`.

---

## Supported Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Transaction signing | Yes | Standard and versioned transactions |
| Versioned transaction signing | Yes | |
| Off-chain message signing | Yes | Requires Solana app >= 1.3.0 |
| Multi-account derivation | Yes | BIP44 path: `m/44'/501'/{account}'/{change}'` |
| Blind signing | Yes | Must be enabled in Solana app settings on the device |
| Device discovery | Partial | Returns a synthetic device entry; real BLE discovery is handled by the transport library |

### Feature flags from the adapter

```typescript
features: {
  signMessage: true,
  signTransaction: true,
  signVersionedTransaction: true,
  multiAccount: true,
  blindSigning: true,
}
```

---

## React Native-Specific Setup

### BLE (Bluetooth Low Energy)

1. Install `@ledgerhq/react-native-hw-transport-ble` and its peer dependency `react-native-ble-plx`.
2. iOS: Add `NSBluetoothAlwaysUsageDescription` and `NSBluetoothPeripheralUsageDescription` to `Info.plist`.
3. Android: Add `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` permissions to `AndroidManifest.xml` (API 31+). For older APIs, add `BLUETOOTH` and `BLUETOOTH_ADMIN`.
4. Request runtime permissions before calling transport methods.

### Providing the Transport

Pass a transport instance or factory when creating the adapter:

```typescript
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble';
import { LedgerAdapter } from '@solana-hw-wallet/adapter-ledger';

const adapter = new LedgerAdapter({
  transportFactory: () => TransportBLE.create(),
});
```

Or provide a pre-connected transport:

```typescript
const transport = await TransportBLE.create();
const adapter = new LedgerAdapter({ transport });
```

### USB on React Native

USB HID is not natively supported in React Native without a native module bridge. For USB on mobile, you would need a custom native module wrapping `@ledgerhq/hw-transport-node-hid` or equivalent. BLE is the recommended transport for React Native.

---

## Known Limitations and Caveats

- **Solana app must be open:** The adapter verifies the Solana app is open during `connect()` by requesting the default address. If the app is not open, you get `SdkErrorCode.WalletAppNotOpen`.
- **One transport at a time:** The adapter holds a single transport instance. You cannot use BLE and USB simultaneously.
- **BLE discovery is external:** `discoverDevices()` returns a synthetic device entry. Actual BLE scanning and pairing is handled by the Ledger transport library before you pass it to the adapter.
- **Blind signing transactions:** Some DeFi transactions require blind signing. If disabled on the device, the Ledger will reject with status code `0x6a80` and the SDK returns `SdkErrorCode.BlindSigningRequired`.
- **Message signing fallback:** If `signOffchainMessage` is not available on the Solana app instance (app version < 1.3.0), `signMessage()` throws `SdkErrorCode.UnsupportedFeature` rather than silently falling back.
- **Buffer dependency:** The adapter uses Node.js `Buffer` for transport communication. In React Native, ensure a `Buffer` polyfill is available (e.g., via `buffer` package).

---

## Common Error Codes and Solutions

| SDK Error Code | Ledger Status Code | Meaning | Solution |
|---|---|---|---|
| `USER_CANCELLED` | `0x6985` | User rejected the action on the Ledger | User must approve on device |
| `WALLET_APP_NOT_OPEN` | `0x6d00` | Solana app is not open (INS_NOT_SUPPORTED) | Open the Solana app on the Ledger |
| `WALLET_APP_NOT_OPEN` | `0x6e00` | Wrong app is open | Close the current app and open Solana |
| `BLIND_SIGNING_REQUIRED` | `0x6a80` | Blind signing is disabled | Enable blind signing in Solana app settings |
| `DISCONNECTED` | -- | BLE/USB connection lost | Reconnect the device and call `connect()` again |
| `TRANSPORT_UNAVAILABLE` | -- | No transport instance or factory provided | Pass `transport` or `transportFactory` in `LedgerAdapterConfig` |
| `UNSUPPORTED_FEATURE` | -- | `signOffchainMessage` not available | Update Solana app to >= 1.3.0 via Ledger Live |
| `NOT_CONNECTED` | -- | Method called before `connect()` | Call `connect()` first |

---

## Testing Notes

### With Real Hardware

1. Install the Solana app on your Ledger via Ledger Live.
2. Open the Solana app on the device.
3. Enable blind signing in the app settings if testing DeFi transactions.
4. For BLE testing on mobile: pair the Ledger device with the phone first via the OS Bluetooth settings, then use the transport factory.
5. For USB testing on desktop/Node.js: connect via USB and ensure Trezor Bridge is **not** running (it can interfere with HID access).

### Verifying Connection

The adapter automatically verifies the connection during `connect()` by calling `getAddress` on derivation path `m/44'/501'/0'/0'`. A successful connect means:
- Transport is working
- Solana app is open and responding
- Device is unlocked

### Testing Message Signing

Message signing requires Solana app >= 1.3.0. To verify your app version, check in Ledger Live under the app manager. If the version is older, `signMessage()` will throw `UNSUPPORTED_FEATURE`.

### Mock Testing

For unit tests without hardware, use `@solana-hw-wallet/test-utils` which provides a `MockAdapter` that implements the same `HardwareWalletAdapter` interface.
