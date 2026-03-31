# Trezor Wallet Adapter

**Package:** `@solana-hw-wallet/adapter-trezor`
**Adapter class:** `TrezorAdapter`
**Wallet type:** `WalletType.Trezor`
**Implementation status:** Fully implemented for transaction signing; message signing is intentionally unsupported

---

## Transport Methods

| Transport | Enum | Mechanism |
|-----------|------|-----------|
| USB | `TransportType.USB` | USB HID via Trezor Bridge or WebUSB |

Trezor communicates exclusively over USB. BLE is not supported by Trezor hardware. Communication is handled entirely by `@trezor/connect`, which abstracts the USB protocol.

---

## Setup Prerequisites

### Device Requirements

- Trezor Model T, Model One, or Safe 3
- Device firmware up to date
- Device unlocked and PIN entered before operations

### Desktop / Node.js

- **Trezor Bridge** must be installed and running. Download from [trezor.io/trezor-suite](https://trezor.io/trezor-suite). Trezor Bridge is a background daemon that provides USB HID access to the device.
- Alternatively, on browsers that support WebUSB, Trezor Connect can communicate directly without Bridge.

### NPM Dependencies

```
pnpm add @solana-hw-wallet/adapter-trezor
pnpm add @trezor/connect
```

### Trezor Connect Manifest

`@trezor/connect` requires a manifest identifying your application. The adapter accepts this via config:

```typescript
import { TrezorAdapter } from '@solana-hw-wallet/adapter-trezor';

const adapter = new TrezorAdapter({
  manifest: {
    email: 'developer@myapp.com',
    appUrl: 'https://myapp.com',
  },
});
```

If no manifest is provided, the adapter uses placeholder values (`developer@example.com` / `https://example.com`). You should always provide real values for production.

---

## Supported Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Transaction signing | Yes | Via `solanaSignTransaction` in @trezor/connect |
| Versioned transaction signing | Yes | |
| Off-chain message signing | No | `signMessage()` throws `UNSUPPORTED_FEATURE` |
| Multi-account derivation | Yes | BIP44 path: `m/44'/501'/{account}'/{change}'` |
| Blind signing | No | Not applicable to Trezor |

### Feature flags from the adapter

```typescript
features: {
  signMessage: false,
  signTransaction: true,
  signVersionedTransaction: true,
  multiAccount: true,
  blindSigning: false,
}
```

### Why Message Signing Is Unsupported

Trezor's Solana message signing support is limited and unstable across models and firmware versions. The `@trezor/connect` API for Solana off-chain message signing is not considered stable. Rather than providing a broken or unreliable feature, the adapter explicitly throws `SdkErrorCode.UnsupportedFeature` with a descriptive message. If your use case requires message signing, use a Ledger or Keystone wallet instead.

---

## React Native-Specific Setup

`@trezor/connect` is primarily designed for web and Node.js environments. It does **not** work natively in React Native. To use Trezor in a React Native app, you need a **WebView bridge approach**:

1. Load Trezor Connect in a hidden `react-native-webview`.
2. Communicate between the React Native app and the WebView via `postMessage` / `onMessage`.
3. The WebView handles the Trezor Connect initialization, device communication, and signing.
4. Results are passed back to the React Native layer.

This is architecturally complex. The current `TrezorAdapter` works well in Node.js and web environments. For React Native, consider:
- Building a WebView wrapper component that bridges `TrezorAdapter` calls.
- Using the Trezor Suite mobile app as a companion (if available for your use case).
- Using a different wallet (Ledger via BLE, or Keystone via QR) for mobile-first applications.

### USB on Mobile

- **Android:** USB OTG is theoretically possible but requires native module support for USB HID. Trezor Bridge does not run on mobile.
- **iOS:** USB HID access is not available to third-party apps on iOS.

---

## Known Limitations and Caveats

- **No message signing:** `signMessage()` always throws. This is intentional and documented, not a bug.
- **React Native requires WebView bridge:** The adapter's dynamic `import('@trezor/connect')` will fail in a bare React Native environment. You must use a WebView-based approach.
- **Trezor Bridge required on desktop:** Without Trezor Bridge running, or without WebUSB support in the browser, `connect()` will fail.
- **PIN entry is external:** Trezor handles PIN entry on-device or via the Trezor Connect popup. The SDK adapter does not manage PIN UI.
- **Passphrase wallets:** If the Trezor has a passphrase enabled, the user will be prompted for it during `connect()`. This is handled by Trezor Connect, not the adapter.
- **Dynamic import:** `@trezor/connect` is dynamically imported during `connect()`. If the package is not installed, you get `SdkErrorCode.TransportUnavailable`.
- **Discovery is synthetic:** `discoverDevices()` returns a single synthetic device entry. Actual device detection is handled by Trezor Connect internally.

---

## Common Error Codes and Solutions

| SDK Error Code | Trezor Error | Meaning | Solution |
|---|---|---|---|
| `USER_CANCELLED` | `Failure_ActionCancelled` | User rejected on device or closed popup | Retry the operation |
| `WALLET_LOCKED` | PIN/locked error | Device is locked or PIN not entered | Unlock the device and enter PIN |
| `DISCONNECTED` | Device disconnected | USB connection lost | Reconnect the device |
| `TRANSPORT_UNAVAILABLE` | -- | `@trezor/connect` not installed | Run `pnpm add @trezor/connect` |
| `CONNECTION_FAILED` | Various | `solanaGetAddress` failed during connect | Check Trezor Bridge is running; check device is unlocked |
| `UNSUPPORTED_FEATURE` | -- | `signMessage()` called | Use `signTransaction()` instead, or use a different wallet for message signing |
| `NOT_CONNECTED` | -- | Method called before `connect()` | Call `connect()` first |

---

## Testing Notes

### With Real Hardware

1. Install Trezor Bridge on your development machine.
2. Connect the Trezor via USB.
3. Unlock the device and enter PIN.
4. Run your test code -- Trezor Connect will open a popup (in browser) or communicate directly (in Node.js).

### Node.js Testing

The adapter works most naturally in Node.js for testing:

```typescript
import { TrezorAdapter } from '@solana-hw-wallet/adapter-trezor';

const adapter = new TrezorAdapter({
  manifest: { email: 'test@test.com', appUrl: 'http://localhost' },
});

await adapter.connect();
const accounts = await adapter.getAccounts({ count: 3 });
console.log(accounts);

// Sign a transaction
const signResult = await adapter.signTransaction(serializedTx, accounts[0].derivationPath);
console.log('Signature:', Buffer.from(signResult.signature).toString('hex'));

await adapter.disconnect();
```

### Browser Testing

Ensure either Trezor Bridge is running or the browser supports WebUSB. Trezor Connect will open a popup window for device interaction.

### Mock Testing

Use `@solana-hw-wallet/test-utils` with `MockAdapter` for unit tests that don't require real hardware.

### What to Verify

- `connect()` succeeds and `connectionState` becomes `Connected`
- `getAccounts()` returns valid Solana addresses (base58, 32-byte public keys)
- `signTransaction()` returns a 64-byte Ed25519 signature
- `signMessage()` throws `SdkErrorCode.UnsupportedFeature`
- `disconnect()` cleans up and disposes `@trezor/connect`
