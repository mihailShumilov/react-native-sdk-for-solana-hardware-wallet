# Solana HW Wallet Demo (React Native)

A demo React Native app showing how to integrate the Solana Hardware Wallet SDK.

## Prerequisites

- Node.js >= 18
- pnpm >= 9
- Xcode 15+ (iOS) or Android Studio (Android)
- CocoaPods (`gem install cocoapods`)
- Physical device recommended (BLE doesn't work in simulators)

## Setup

From the **monorepo root**:

```bash
# Install all dependencies
pnpm install

# Build all SDK packages (required before running the app)
pnpm build
```

## Run on iOS

```bash
cd apps/demo-react-native

# Install native dependencies (first time or after adding pods)
cd ios && pod install && cd ..

# Run the app
npx react-native run-ios

# Or specify a device
npx react-native run-ios --device "iPhone 15 Pro"
```

## Run on Android

```bash
cd apps/demo-react-native

# Make sure you have an emulator running or device connected
npx react-native run-android
```

## Start Metro Bundler Separately

Useful for seeing full error output:

```bash
cd apps/demo-react-native
npx react-native start --reset-cache
```

Then run `npx react-native run-ios` or `run-android` in another terminal.

## What the Demo Shows

1. **Device Discovery** -- Scan for available hardware wallets via BLE/USB
2. **Connection** -- Connect to a discovered wallet and see connection state
3. **Account Derivation** -- Load derived Solana accounts (BIP44 paths)
4. **Message Signing** -- Sign an arbitrary message on the hardware device
5. **Transaction Signing** -- Sign a Solana transaction on the hardware device
6. **Error Handling** -- Display typed SDK errors with codes and recovery hints

## Configured Adapters

The demo initializes all 4 wallet adapters:

| Adapter | Transport | Notes |
|---------|-----------|-------|
| Ledger | BLE/USB | Requires Solana app open on device |
| Keystone | QR | Air-gapped, needs camera permission |
| Trezor | USB | Needs Trezor Bridge on desktop |
| SafePal | QR | Partial -- proprietary protocol |

## Permissions

The app is pre-configured with the following permissions:

**iOS** (Info.plist):
- `NSBluetoothAlwaysUsageDescription` -- BLE for Ledger
- `NSCameraUsageDescription` -- QR scanning for Keystone/SafePal
- `NFCReaderUsageDescription` -- NFC support
- `NSLocationWhenInUseUsageDescription` -- Required for BLE scanning

**Android** (AndroidManifest.xml):
- `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`
- `ACCESS_FINE_LOCATION` (required for BLE on Android)
- `NFC`, `CAMERA`

## Troubleshooting

**Metro can't find `@solana-hw-wallet/*` packages:**
Make sure you ran `pnpm build` from the monorepo root first. The demo app imports the compiled `dist/` output from each package.

**Pod install fails:**
```bash
cd ios
pod deintegrate
pod install --repo-update
```

**Android build fails with SDK version errors:**
Open `android/` in Android Studio and let it sync Gradle, or update `compileSdkVersion` in `android/app/build.gradle`.

**BLE not working in iOS Simulator:**
Use a physical device. The iOS Simulator does not support Bluetooth.
