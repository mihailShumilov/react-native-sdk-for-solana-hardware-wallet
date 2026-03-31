# Keystone Wallet Adapter

**Package:** `@solana-hw-wallet/adapter-keystone`
**Adapter class:** `KeystoneAdapter`
**Wallet type:** `WalletType.Keystone`
**Implements:** `QrWalletAdapter`
**Implementation status:** Functional with fallback codecs; full UR encoding is a TODO

---

## Transport Methods

| Transport | Enum | Mechanism |
|-----------|------|-----------|
| QR | `TransportType.QR` | Air-gapped, camera-based QR code exchange |

Keystone is a fully air-gapped wallet. There is no BLE, USB, or NFC connection. All communication happens through QR codes:

1. The SDK generates a QR code containing the signing request.
2. The user scans this QR with the Keystone device's camera.
3. The Keystone signs and displays a result QR code on its screen.
4. The user scans the result QR back into the app using the phone's camera.

The QR data uses the **Blockchain Commons UR (Uniform Resource) standard**:

- Account sync: `ur:crypto-multi-accounts`
- Sign request: `ur:sol-sign-request`
- Sign response: `ur:sol-signature`

---

## Setup Prerequisites

### Device Requirements

- Keystone hardware wallet (Keystone 3 Pro or Essential recommended) with Solana support enabled in the device firmware settings.
- Device firmware should be up to date for best compatibility.

### NPM Dependencies

```
# Required
pnpm add @solana-hw-wallet/adapter-keystone

# For full UR encoding (recommended for production)
pnpm add @keystonehq/sol-keyring @ngraveio/bc-ur
```

### App-Side Requirements

The app **must** provide QR callbacks via `KeystoneAdapterConfig.qrCallbacks`. The adapter does not include any QR rendering or camera scanning -- that is the app's responsibility. You need:

- A QR code renderer component (e.g., `react-native-qrcode-svg`)
- A QR code scanner component (e.g., `react-native-camera` or `expo-camera`)
- UI to orchestrate the display/scan/dismiss flow

---

## Supported Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Transaction signing | Yes | Via QR code exchange |
| Versioned transaction signing | Yes | |
| Off-chain message signing | Yes | Requires Keystone firmware >= 1.3.0 |
| Multi-account derivation | Yes | Accounts synced from device via QR |
| Blind signing | No | Not applicable to Keystone |
| Account sync via QR | Yes | Scans Keystone's account QR to import public keys |

### Feature flags from the adapter

```typescript
features: {
  signMessage: true,
  signTransaction: true,
  signVersionedTransaction: true,
  multiAccount: true,
  blindSigning: false,
}
```

---

## How It Works

### Connection (Account Sync)

Calling `connect()` triggers the account sync flow:

1. The adapter calls `qrCallbacks.onScanQr()` to prompt the user to scan the Keystone's account export QR.
2. The scanned data is decoded (UR format or JSON fallback) to extract Solana account public keys.
3. Synced accounts are stored in-memory for later use by `getAccounts()`.

There is no persistent connection -- "connected" means accounts have been synced.

### Transaction Signing

1. `signTransaction()` encodes the transaction as a UR sign request via `ur-codec.ts`.
2. The adapter calls `qrCallbacks.onDisplayQr(data, type)` for the app to render the QR code.
3. The user scans this QR with the Keystone device.
4. The Keystone displays a signed response QR on its screen.
5. The adapter calls `qrCallbacks.onScanQr()` for the app to scan the result.
6. The adapter calls `qrCallbacks.onDismissQr()` to clean up the QR display.
7. The signature is decoded and returned.

### QR Callbacks Interface

```typescript
interface QrTransportCallbacks {
  onDisplayQr(data: string, type: string): void;
  onScanQr(): Promise<string>;
  onDismissQr(): void;
}
```

---

## React Native-Specific Setup

1. **Camera permission:** Add camera permission to `Info.plist` (iOS) and `AndroidManifest.xml` (Android).
2. **QR scanner library:** Install a camera/QR scanning library such as `react-native-camera`, `expo-camera`, or `react-native-vision-camera`.
3. **QR renderer library:** Install a QR code rendering library such as `react-native-qrcode-svg`.
4. **Implement the callbacks:**

```typescript
import { KeystoneAdapter } from '@solana-hw-wallet/adapter-keystone';

const adapter = new KeystoneAdapter({
  qrCallbacks: {
    onDisplayQr: (data, type) => {
      // Show a modal with a QR code rendered from `data`
      navigation.navigate('DisplayQR', { data, type });
    },
    onScanQr: () => {
      // Open camera scanner and return the scanned string
      return new Promise((resolve) => {
        navigation.navigate('ScanQR', { onScan: resolve });
      });
    },
    onDismissQr: () => {
      // Close the QR display modal
      navigation.goBack();
    },
  },
});
```

---

## UR Codec Status

The file `packages/adapter-keystone/src/ur-codec.ts` provides the encoding/decoding interface. Currently:

- **`encodeSignRequest`**: Falls back to JSON-serialized hex when `@keystonehq/sol-keyring` is not available.
- **`decodeSignResponse`**: Falls back to JSON or raw hex parsing.
- **`decodeAccountSync`**: Falls back to JSON parsing.

For production deployments, install `@keystonehq/sol-keyring` and `@ngraveio/bc-ur` and update the codec to use proper UR encoding. The current fallback behavior works for development and testing but will **not** be compatible with a real Keystone device that expects UR-formatted QR codes.

---

## Known Limitations and Caveats

- **UR encoding is incomplete:** The `ur-codec.ts` uses JSON/hex fallbacks. Full UR encoding via `@keystonehq/sol-keyring` is marked as TODO. Without it, real Keystone devices cannot parse the QR codes.
- **No persistent connection:** Each `connect()` requires a fresh QR scan for account sync. Accounts are held in-memory only.
- **QR callbacks are mandatory:** If `qrCallbacks` is not provided, `connect()` throws `SdkErrorCode.TransportUnavailable`.
- **User experience depends on app implementation:** The adapter delegates all QR display and scanning to the app. Poor UX in the QR flow (slow camera, small QR codes) will affect the signing experience.
- **Large transactions may require animated QR:** Very large serialized transactions may exceed single QR code capacity. The UR standard supports animated (multi-frame) QR codes, but this is not yet implemented in the codec.
- **Error on dismiss:** If `onScanQr()` is rejected (user cancels), `onDismissQr()` is still called in the catch block to ensure cleanup.

---

## Common Error Codes and Solutions

| SDK Error Code | Meaning | Solution |
|---|---|---|
| `TRANSPORT_UNAVAILABLE` | `qrCallbacks` not provided in config | Pass `qrCallbacks` when constructing the adapter |
| `NOT_CONNECTED` | Method called before `connect()` | Call `connect()` to sync accounts first |
| `DERIVATION_FAILED` | No Solana accounts found in scanned QR | Ensure Keystone has Solana accounts configured |
| `QR_DECODING_FAILED` | Could not decode the scanned QR data | Ensure you scanned the correct QR from the Keystone device |
| `SIGNING_FAILED` | Invalid signature length in response QR | Verify the scanned QR is the signing response (not account sync) |
| `USER_CANCELLED` | User cancelled the QR scan | Retry the operation |
| `UNKNOWN` | Unclassified error during QR flow | Check the error message for details |

---

## Testing Notes

### With Real Hardware

1. Enable Solana on the Keystone device.
2. Navigate to the Solana account export screen on the Keystone to display the account sync QR.
3. **Important:** Full UR codec support is needed to test with real hardware. The current JSON fallback will not work with the actual Keystone device.
4. For development testing, you can mock the QR callbacks to return pre-built JSON payloads:

```typescript
const mockCallbacks = {
  onDisplayQr: (data: string, type: string) => console.log('QR:', type, data),
  onScanQr: () => Promise.resolve(JSON.stringify({
    accounts: [{
      address: 'SoMeBase58Address...',
      publicKey: 'abcdef1234...',  // hex-encoded
      derivationPath: "m/44'/501'/0'/0'",
      index: 0,
    }],
  })),
  onDismissQr: () => {},
};
```

### Mock Testing

Use `@solana-hw-wallet/test-utils` for unit tests. The `MockAdapter` can simulate the QR-based flow without any camera or device.

### Integration Testing

For end-to-end testing with the real QR flow but without hardware, build a test harness that:
1. Renders real QR codes from the adapter's output.
2. Decodes them manually to verify the payload structure.
3. Generates mock signed response QR data to feed back into `processSignResponse()`.
