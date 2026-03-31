# SafePal Wallet Adapter

**Package:** `@solana-hw-wallet/adapter-safepal`
**Adapter class:** `SafePalAdapter`
**Wallet type:** `WalletType.SafePal`
**Implements:** `QrWalletAdapter`
**Implementation status:** PARTIAL -- adapter contract is implemented, but SafePal's proprietary QR protocol is not

---

## Implementation Status Warning

**This adapter is incomplete.** SafePal uses a proprietary QR encoding protocol that is not publicly documented. The adapter implements the correct architecture and interface contract (`QrWalletAdapter`), but the actual QR encoding/decoding for communication with a real SafePal S1 device is not functional.

What is implemented:
- Full adapter lifecycle (connect, disconnect, dispose)
- QR callback flow structure (display, scan, dismiss)
- `QrWalletAdapter` interface methods (`generateSignRequest`, `processSignResponse`, `generateAccountSyncRequest`, `processAccountSyncResponse`)
- Error handling and connection state management
- JSON fallback for development/testing

What is NOT implemented:
- SafePal's proprietary QR encoding format for transaction signing
- SafePal's proprietary QR format for account sync
- SafePal's proprietary QR format for message signing (if supported)
- Actual device compatibility

---

## Transport Methods

| Transport | Enum | Mechanism |
|-----------|------|-----------|
| QR | `TransportType.QR` | Air-gapped, camera-based QR code exchange |

SafePal S1 is an air-gapped hardware wallet that communicates exclusively via QR codes, similar to Keystone. However, unlike Keystone which uses the open Blockchain Commons UR standard, SafePal uses a **proprietary QR encoding format**.

---

## Setup Prerequisites

### Device Requirements

- SafePal S1 hardware wallet
- Solana support enabled on the device

### NPM Dependencies

```
pnpm add @solana-hw-wallet/adapter-safepal
```

There are no additional protocol-specific dependencies because the protocol is not yet implemented. The adapter has no external dependencies beyond the SDK workspace packages.

### App-Side Requirements

Same as Keystone -- the app must provide QR callbacks:

```typescript
import { SafePalAdapter } from '@solana-hw-wallet/adapter-safepal';

const adapter = new SafePalAdapter({
  qrCallbacks: {
    onDisplayQr: (data, type) => { /* render QR code */ },
    onScanQr: () => { /* open scanner, return scanned data */ },
    onDismissQr: () => { /* close QR display */ },
  },
});
```

---

## Supported Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Transaction signing | Partial | Adapter flow works, but QR encoding is placeholder |
| Versioned transaction signing | No | Unknown -- protocol not documented |
| Off-chain message signing | No | Throws `UNSUPPORTED_FEATURE` |
| Multi-account derivation | Partial | Depends on account sync QR format |
| Blind signing | No | Not applicable |

### Feature flags from the adapter

```typescript
features: {
  signMessage: false,        // Unknown -- protocol not documented
  signTransaction: true,     // Partial -- QR format needs documentation
  signVersionedTransaction: false,  // Unknown
  multiAccount: true,
  blindSigning: false,
}
```

These feature flags reflect the target capabilities. In practice, `signTransaction` will not work with a real SafePal device until the proprietary QR protocol is implemented.

---

## How It Works (Current Implementation)

### Connection (Account Sync)

1. `connect()` calls `qrCallbacks.onScanQr()` to prompt scanning the SafePal's account QR.
2. The scanned data is parsed as JSON (fallback format).
3. Expected JSON format for development/testing:

```json
{
  "accounts": [
    {
      "address": "SoMeBase58SolanaAddress...",
      "publicKey": "hexEncodedPublicKey...",
      "index": 0
    }
  ]
}
```

4. This will **not** work with a real SafePal device, which uses a proprietary format.

### Transaction Signing

1. `signTransaction()` serializes the request as JSON with hex-encoded transaction bytes.
2. The QR type is set to `safepal:sol-sign-request` (placeholder).
3. The response is expected as JSON with a `signature` field or raw hex.
4. Again, this is a placeholder -- real SafePal devices will not understand this format.

---

## React Native-Specific Setup

The same QR infrastructure applies as for Keystone:

1. Camera permission for QR scanning.
2. QR scanner library (e.g., `expo-camera`, `react-native-vision-camera`).
3. QR renderer library (e.g., `react-native-qrcode-svg`).
4. Implement the `QrTransportCallbacks` interface.

---

## Known Limitations and Caveats

- **Proprietary protocol not implemented:** This is the primary blocker. SafePal does not publish their QR protocol for third-party integration. The adapter uses JSON placeholders that will not work with real hardware.
- **Message signing unsupported:** `signMessage()` throws `SdkErrorCode.UnsupportedFeature`. It is unknown whether SafePal's protocol supports message signing.
- **Versioned transaction support unknown:** The adapter marks `signVersionedTransaction` as `false` because the protocol behavior for versioned transactions is undocumented.
- **No external dependencies:** Unlike Keystone (which has `@keystonehq/sol-keyring`), there is no SafePal SDK package for QR encoding. This would need to be reverse-engineered or obtained from SafePal directly.
- **Feature flags may be inaccurate:** The `features` object is a best guess based on the SafePal S1's general capabilities. Actual support depends on the firmware and protocol.

---

## What Needs to Happen to Complete This Adapter

1. **Obtain SafePal QR protocol documentation:** Contact SafePal for their hardware wallet QR encoding specification, or reverse-engineer it from the SafePal mobile app.
2. **Implement QR encoding/decoding:** Create a `safepal-codec.ts` (analogous to Keystone's `ur-codec.ts`) that handles the proprietary format.
3. **Verify account sync format:** Determine how SafePal exports account public keys via QR and implement `decodeAccountSync()`.
4. **Verify signing response format:** Determine how SafePal returns signatures via QR and implement `processSignResponse()`.
5. **Test with real hardware:** Validate the full flow with an actual SafePal S1 device.
6. **Update feature flags:** Adjust the `features` object based on actual protocol capabilities.

Alternatively, SafePal may offer a mobile SDK for direct integration that bypasses the QR protocol entirely. This would require a different adapter architecture.

---

## Common Error Codes and Solutions

| SDK Error Code | Meaning | Solution |
|---|---|---|
| `TRANSPORT_UNAVAILABLE` | `qrCallbacks` not provided | Pass `qrCallbacks` in config |
| `NOT_CONNECTED` | Method called before `connect()` | Call `connect()` first |
| `DERIVATION_FAILED` | No accounts found in scanned QR | Ensure the QR data contains valid account information |
| `QR_DECODING_FAILED` | Could not decode the scanned QR data | The scanned data does not match the expected format (likely the proprietary format issue) |
| `SIGNING_FAILED` | Invalid signature in response | Verify the response QR data contains a valid 64-byte signature |
| `UNSUPPORTED_FEATURE` | `signMessage()` called | Message signing is not available for SafePal |

---

## Testing Notes

### With Real Hardware

**Not currently possible.** The proprietary QR protocol must be implemented first. If you have a SafePal S1 and want to help:

1. Use the SafePal mobile app to observe the QR code content during account export and transaction signing.
2. Capture and decode the QR data to understand the format.
3. Open an issue or PR with findings.

### Development Testing

For development and integration testing without hardware, provide mock QR callbacks that return JSON:

```typescript
const mockCallbacks = {
  onDisplayQr: (data: string, type: string) => {
    console.log(`[SafePal QR] type=${type}`, data);
  },
  onScanQr: () => Promise.resolve(JSON.stringify({
    accounts: [{
      address: 'MockSafePalAddress11111111111111111111',
      publicKey: '0'.repeat(64),
      index: 0,
    }],
  })),
  onDismissQr: () => {},
};

const adapter = new SafePalAdapter({ qrCallbacks: mockCallbacks });
await adapter.connect();  // Works with mock data
```

### Mock Testing

Use `@solana-hw-wallet/test-utils` with `MockAdapter` for unit tests.
