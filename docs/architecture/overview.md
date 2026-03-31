# Architecture Overview

This document describes the architecture of the Solana Hardware Wallet SDK monorepo: a layered, adapter-based system for interacting with hardware wallets (Ledger, Trezor, Keystone, SafePal) from React Native and Node.js applications.

## Package Dependency Graph

The monorepo is organized into four tiers: shared foundations, domain logic, wallet-specific adapters, and the consumer-facing React Native layer.

```mermaid
graph TD
    shared["@solana-hw-wallet/shared<br/><i>Types, enums, event emitter</i>"]

    core["@solana-hw-wallet/core<br/><i>Adapter interface, SDK class, errors</i>"]
    solana["@solana-hw-wallet/solana<br/><i>Derivation paths, tx helpers</i>"]
    transports["@solana-hw-wallet/transports<br/><i>Transport abstractions</i>"]

    ledger["@solana-hw-wallet/adapter-ledger<br/><i>Ledger BLE/USB</i>"]
    keystone["@solana-hw-wallet/adapter-keystone<br/><i>Keystone QR</i>"]
    trezor["@solana-hw-wallet/adapter-trezor<br/><i>Trezor USB</i>"]
    safepal["@solana-hw-wallet/adapter-safepal<br/><i>SafePal QR (partial)</i>"]

    rn["@solana-hw-wallet/react-native<br/><i>Provider, hooks</i>"]
    testutils["@solana-hw-wallet/test-utils<br/><i>MockAdapter, test SDK</i>"]

    core --> shared
    solana --> shared
    transports --> shared

    ledger --> core
    ledger --> shared
    ledger --> solana
    ledger --> transports

    keystone --> core
    keystone --> shared
    keystone --> solana
    keystone --> transports

    trezor --> core
    trezor --> shared
    trezor --> solana
    trezor --> transports

    safepal --> core
    safepal --> shared
    safepal --> solana
    safepal --> transports

    rn --> core
    rn --> shared
    rn --> solana
    rn --> transports

    testutils --> core
    testutils --> shared
    testutils --> solana
    testutils --> transports

    style shared fill:#e8f5e9,stroke:#2e7d32
    style core fill:#e3f2fd,stroke:#1565c0
    style solana fill:#e3f2fd,stroke:#1565c0
    style transports fill:#e3f2fd,stroke:#1565c0
    style ledger fill:#fff3e0,stroke:#e65100
    style keystone fill:#fff3e0,stroke:#e65100
    style trezor fill:#fff3e0,stroke:#e65100
    style safepal fill:#fff3e0,stroke:#e65100
    style rn fill:#fce4ec,stroke:#b71c1c
    style testutils fill:#f3e5f5,stroke:#6a1b9a
```

**Dependency rule:** arrows point from dependant to dependency. Every adapter depends on `core`, `shared`, `solana`, and `transports`. The `core` package depends only on `shared`. The `react-native` package depends on the core layer but never on specific adapters -- adapters are injected at runtime.

## SDK Layer Architecture

The SDK is structured in concentric layers. Each layer has a single responsibility and communicates only with its immediate neighbors.

```mermaid
graph LR
    subgraph "Layer 1 - Foundation"
        shared2["shared<br/>Types, enums,<br/>EventEmitter, Logger"]
    end

    subgraph "Layer 2 - Domain"
        transports2["transports<br/>Transport, TransportFactory,<br/>QrTransportCallbacks"]
        solana2["solana<br/>BIP44 derivation,<br/>tx serialization"]
        core2["core<br/>HardwareWalletAdapter,<br/>HardwareWalletSdk,<br/>SdkError"]
    end

    subgraph "Layer 3 - Adapters"
        adapters2["adapter-ledger<br/>adapter-keystone<br/>adapter-trezor<br/>adapter-safepal"]
    end

    subgraph "Layer 4 - Consumer"
        rn2["react-native<br/>HardwareWalletProvider,<br/>useHardwareWallet,<br/>useWalletConnection,<br/>useWalletDiscovery,<br/>useDerivedAccounts"]
    end

    shared2 --> transports2
    shared2 --> solana2
    shared2 --> core2
    core2 --> adapters2
    transports2 --> adapters2
    solana2 --> adapters2
    adapters2 --> rn2
```

| Layer | Package(s) | Responsibility |
|-------|-----------|----------------|
| Foundation | `shared` | Zero-dependency base: `WalletType`, `TransportType`, `ConnectionState` enums; `TypedEventEmitter`; `Logger` interface; all shared TS interfaces (`DiscoveredDevice`, `DerivedAccount`, `SignResult`, etc.) |
| Domain | `core`, `solana`, `transports` | `core` defines the `HardwareWalletAdapter` interface, `QrWalletAdapter` extension, `HardwareWalletSdk` orchestrator, and `SdkError` hierarchy. `solana` provides BIP44 derivation path construction/parsing and `@solana/web3.js` transaction serialization helpers. `transports` defines `Transport` and `TransportFactory` interfaces plus config types for BLE, USB, QR, and NFC. |
| Adapters | `adapter-*` | Each adapter implements `HardwareWalletAdapter` (or `QrWalletAdapter`) for a specific wallet. Adapters own wallet-specific protocol logic: APDU commands for Ledger, `@trezor/connect` for Trezor, UR codec for Keystone. |
| Consumer | `react-native` | React context provider and hooks that wrap the SDK for declarative use in React Native apps. Manages React state, lifecycle subscriptions, and loading/error states. |

## Adapter Pattern Flow

The SDK uses dependency inversion: the `HardwareWalletSdk` class operates exclusively through the `HardwareWalletAdapter` interface. Concrete adapters are injected at construction time.

```mermaid
sequenceDiagram
    participant App as React Native App
    participant Provider as HardwareWalletProvider
    participant SDK as HardwareWalletSdk
    participant Adapter as HardwareWalletAdapter
    participant Device as Hardware Wallet

    App->>Provider: <HardwareWalletProvider sdk={sdk}>
    Note over Provider: Stores SDK in React Context

    App->>SDK: createHardwareWalletSdk({ adapters: [ledger, keystone] })
    SDK->>SDK: Register adapters by ID into Map

    App->>SDK: discoverDevices()
    SDK->>Adapter: adapter.discoverDevices(transport, timeout)
    Adapter-->>SDK: DiscoveredDevice[]
    SDK->>SDK: emit(SdkEvent.DeviceDiscovered, ...)
    SDK-->>App: DiscoveredDevice[]

    App->>SDK: connect('ledger', deviceId)
    SDK->>SDK: Disconnect active adapter if any
    SDK->>SDK: emit(ConnectionStateChanged → Connecting)
    SDK->>Adapter: adapter.connect(deviceId, transport, timeout)
    Adapter->>Device: Open transport, verify wallet app
    Device-->>Adapter: Connected
    Adapter-->>SDK: void
    SDK->>SDK: emit(ConnectionStateChanged → Connected)

    App->>SDK: signTransaction(txBytes, derivationPath)
    SDK->>SDK: Check features.signTransaction
    SDK->>Adapter: adapter.signTransaction(txBytes, path)
    Adapter->>Device: Protocol-specific signing
    Device-->>Adapter: Signature bytes
    Adapter-->>SDK: SignResult { signature }
    SDK-->>App: SignResult
```

## Connection Lifecycle State Machine

Every adapter tracks a `ConnectionState` enum. The SDK emits `ConnectionStateChanged` events on every transition and ensures only one adapter is active at a time.

```mermaid
stateDiagram-v2
    [*] --> Disconnected

    Disconnected --> Connecting: connect()
    Connecting --> Connected: Transport opened,<br/>wallet app verified
    Connecting --> Disconnected: Error / timeout

    Connected --> Disconnecting: disconnect()
    Connected --> Disconnected: Unexpected disconnect<br/>(BLE loss, USB unplug)

    Disconnecting --> Disconnected: Transport closed

    Disconnected --> [*]: dispose()
```

**State transitions in the SDK:**

1. `connect(adapterId, deviceId)` -- SDK sets state to `Connecting`, delegates to the adapter. On success, state becomes `Connected`. On failure, state reverts to `Disconnected`.
2. `disconnect()` -- SDK sets state to `Disconnecting` (adapter-side), calls `adapter.disconnect()`, then sets `Disconnected`.
3. Calling `connect()` while another adapter is active automatically calls `disconnect()` on the previous adapter first.
4. `dispose()` disconnects the active adapter, disposes all registered adapters, clears the adapter map, and removes all event listeners.

**QR wallets (Keystone, SafePal) have a different notion of "connected":** they perform an account sync via QR scan during `connect()`. There is no persistent transport -- the "connected" state means "accounts have been synced and are cached." Each signing operation initiates a new QR display/scan cycle.

## Signing Flow: BLE/USB Wallets (Ledger, Trezor)

For wallets with persistent transport connections, signing is a direct request-response over the transport.

```mermaid
sequenceDiagram
    participant App
    participant SDK as HardwareWalletSdk
    participant Adapter as LedgerAdapter / TrezorAdapter
    participant Transport as BLE / USB Transport
    participant Device as Hardware Wallet

    App->>SDK: signTransaction(txBytes, derivationPath)
    SDK->>SDK: requireConnected()
    SDK->>SDK: Check features.signTransaction

    SDK->>Adapter: signTransaction(txBytes, derivationPath)

    alt Ledger
        Adapter->>Transport: solanaApp.signTransaction(path, buffer)
        Transport->>Device: APDU command (INS=0x04)
        Device->>Device: User confirms on device screen
        Device-->>Transport: APDU response with signature
        Transport-->>Adapter: { signature: Buffer }
    else Trezor
        Adapter->>Transport: trezorConnect.solanaSignTransaction({ path, serializedTx })
        Transport->>Device: Protobuf message via USB HID
        Device->>Device: User confirms on device screen
        Device-->>Transport: { success: true, payload: { signature } }
        Transport-->>Adapter: hex signature string
    end

    Adapter->>Adapter: Normalize to Uint8Array
    Adapter-->>SDK: SignResult { signature }

    alt Error
        Adapter->>Adapter: mapLedgerError() / mapTrezorError()
        Adapter-->>SDK: SdkError (UserCancelled / WalletAppNotOpen / ...)
        SDK->>SDK: wrapError() ensures SdkError
        SDK-->>App: throws SdkError
    end

    SDK-->>App: SignResult { signature }
```

### Ledger error mapping

The `LedgerAdapter.mapLedgerError()` method translates Ledger APDU status codes to SDK error codes:

| APDU Status | SDK Error Code | Meaning |
|-------------|---------------|---------|
| `0x6985` | `UserCancelled` | User denied the request on device |
| `0x6d00` | `WalletAppNotOpen` | Solana app is not open |
| `0x6e00` | `WalletAppNotOpen` | Wrong app open |
| `0x6a80` | `BlindSigningRequired` | Blind signing not enabled in settings |

### Trezor error mapping

The `TrezorAdapter.mapTrezorError()` method translates Trezor Connect failure codes:

| Trezor Code | SDK Error Code | Meaning |
|-------------|---------------|---------|
| `Failure_ActionCancelled` | `UserCancelled` | User cancelled on device |
| Contains "PIN" / "locked" | `WalletLocked` | Device is locked |
| Contains "disconnected" | `Disconnected` | USB connection lost |

## Signing Flow: QR-Based Wallets (Keystone, SafePal)

QR wallets operate without a persistent transport. Each signing operation is a multi-step QR exchange between the app and the air-gapped device.

```mermaid
sequenceDiagram
    participant App
    participant SDK as HardwareWalletSdk
    participant Adapter as KeystoneAdapter
    participant QrUI as QrTransportCallbacks<br/>(App-provided)
    participant Device as Keystone Device

    App->>SDK: signTransaction(txBytes, derivationPath)
    SDK->>Adapter: signTransaction(txBytes, derivationPath)

    Adapter->>Adapter: generateSignRequest(txBytes, path)
    Note over Adapter: Encode as UR (ur:sol-sign-request)<br/>via ur-codec.ts

    Adapter->>QrUI: onDisplayQr(urData, 'ur:sol-sign-request')
    Note over QrUI: App renders QR code on screen

    QrUI->>Device: User shows phone screen to Keystone
    Device->>Device: Keystone scans QR, parses UR,<br/>displays transaction details
    Device->>Device: User confirms on Keystone

    Device->>QrUI: Keystone displays signed QR
    QrUI->>QrUI: App opens camera, scans QR

    QrUI-->>Adapter: onScanQr() resolves with scannedData

    Adapter->>QrUI: onDismissQr()
    Note over QrUI: App hides QR display

    Adapter->>Adapter: processSignResponse(scannedData)
    Note over Adapter: Decode UR signature<br/>via ur-codec.ts

    Adapter-->>SDK: SignResult { signature }
    SDK-->>App: SignResult { signature }
```

**QR encoding standards:**

| Wallet | QR Format | Sign Request Type | Sign Response Type |
|--------|-----------|------------------|-------------------|
| Keystone | Blockchain Commons UR | `ur:sol-sign-request` | `ur:sol-signature` |
| SafePal | Proprietary (undocumented) | `safepal:sol-sign-request` | Proprietary |

The `QrTransportCallbacks` interface (defined in `@solana-hw-wallet/transports`) is the bridge between the SDK and the app's QR UI. The app must implement three callbacks:

- `onDisplayQr(data, type)` -- render a QR code containing `data`
- `onScanQr()` -- open a camera scanner and return the scanned string
- `onDismissQr()` -- hide the QR display

This design keeps the SDK free of any UI framework dependency. The app provides the QR rendering and scanning implementation appropriate for its platform (React Native camera libraries, web canvas, etc.).

## Account Sync Flow (QR Wallets)

For QR wallets, `connect()` performs an account sync rather than opening a transport:

```mermaid
sequenceDiagram
    participant App
    participant SDK as HardwareWalletSdk
    participant Adapter as KeystoneAdapter
    participant QrUI as QrTransportCallbacks
    participant Device as Keystone Device

    App->>SDK: connect('keystone')
    SDK->>Adapter: connect()

    Adapter->>QrUI: onScanQr()
    Note over QrUI: App opens camera

    Device->>QrUI: Keystone displays account QR<br/>(ur:crypto-multi-accounts)
    QrUI-->>Adapter: Scanned UR data

    Adapter->>Adapter: decodeAccountSync(urData)
    Note over Adapter: Parse UR into DerivedAccount[]

    Adapter->>Adapter: Cache syncedAccounts

    Adapter-->>SDK: void (connected)
    SDK->>SDK: emit(ConnectionStateChanged → Connected)
    SDK-->>App: connected

    App->>SDK: getAccounts()
    SDK->>Adapter: getAccounts(options)
    Adapter-->>SDK: Return cached syncedAccounts
```

After account sync, `getAccounts()` returns the cached accounts without any further QR interaction.

## Event System

The SDK extends `TypedEventEmitter<SdkEventMap>` and emits strongly-typed events:

```mermaid
graph LR
    SDK["HardwareWalletSdk<br/>(TypedEventEmitter)"]

    SDK -->|"device:discovered"| DD["DiscoveredDevice"]
    SDK -->|"device:removed"| DR["{ deviceId }"]
    SDK -->|"connection:stateChanged"| CS["{ deviceId, state, previousState }"]
    SDK -->|"error"| ER["{ error, context? }"]

    subgraph "React Native Hooks (subscribers)"
        hook1["useWalletDiscovery<br/>listens: device:discovered"]
        hook2["useWalletConnection<br/>listens: connection:stateChanged"]
        hook3["useHardwareWallet<br/>listens: connection:stateChanged"]
        hook4["useDerivedAccounts<br/>listens: connection:stateChanged"]
    end

    DD --> hook1
    CS --> hook2
    CS --> hook3
    CS --> hook4
```

Each hook subscribes via `sdk.on(event, handler)` in a `useEffect` and returns the unsubscribe function as the cleanup. The `TypedEventEmitter` class provides type-safe event emission and subscription, with listener errors silently caught to avoid breaking the emitter chain.

## React Native Integration

The React Native layer provides a context-based API:

```mermaid
graph TD
    Provider["<HardwareWalletProvider sdk={sdk}>"]
    Context["HardwareWalletContext<br/>{ sdk: HardwareWalletSdk | null }"]

    Provider -->|"provides"| Context

    Context -->|"consumed by"| hook1["useWalletDiscovery()"]
    Context -->|"consumed by"| hook2["useWalletConnection()"]
    Context -->|"consumed by"| hook3["useHardwareWallet()"]
    Context -->|"consumed by"| hook4["useDerivedAccounts()"]

    hook3 -->|"combines"| hook3a["Connection state"]
    hook3 -->|"combines"| hook3b["Account derivation"]
    hook3 -->|"combines"| hook3c["Signing operations"]
    hook3 -->|"combines"| hook3d["Error management"]
```

| Hook | Purpose | Reactive State |
|------|---------|---------------|
| `useWalletDiscovery` | Scan for available devices | `devices`, `isDiscovering`, `error` |
| `useWalletConnection` | Connect/disconnect lifecycle | `connectionState`, `isConnecting`, `isConnected`, `error` |
| `useHardwareWallet` | All-in-one wallet interaction | Connection + accounts + signing + errors |
| `useDerivedAccounts` | Account derivation with auto-load on connect | `accounts`, `isLoading`, `error` |

All hooks throw if used outside `<HardwareWalletProvider>`, enforced by `useHardwareWalletContext()`.

## External Dependencies

The SDK uses dynamic imports for wallet-specific libraries to avoid hard dependencies:

| Adapter | Dynamic Import | Purpose |
|---------|---------------|---------|
| Ledger | `@ledgerhq/hw-app-solana` | Solana APDU commands |
| Trezor | `@trezor/connect` | Trezor Connect API |
| Keystone | `./ur-codec.js` (wraps `@keystonehq/sol-keyring`, `@ngraveio/bc-ur`) | UR encoding/decoding |
| SafePal | None (proprietary protocol, not yet available) | -- |

This means an app that only uses the Ledger adapter does not need `@trezor/connect` installed, and vice versa.
