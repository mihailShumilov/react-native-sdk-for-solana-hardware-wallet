# Node.js Examples

Example scripts demonstrating the Solana Hardware Wallet SDK in a Node.js environment. All examples use the `MockAdapter` so **no hardware device is needed**.

## Setup

From the **monorepo root**:

```bash
pnpm install
pnpm build
```

## Available Examples

### Derive Accounts

Derives 5 Solana accounts using BIP44 paths (`m/44'/501'/N'/0'`):

```bash
pnpm --filter @solana-hw-wallet/examples-node example:derive
```

Shows: SDK initialization, mock device discovery, connection, and multi-account derivation.

### Sign Message

Signs a text message and a Sign-In With Solana (SIWS) style message:

```bash
pnpm --filter @solana-hw-wallet/examples-node example:sign-message
```

Shows: Message encoding, signing, SDK event listeners, error handling.

### Sign Transaction

Builds a SOL transfer transaction and signs it:

```bash
pnpm --filter @solana-hw-wallet/examples-node example:sign-transaction
```

Shows: Transaction construction with `@solana/web3.js`, serialization, signing, typed error handling with `SdkErrorCode`.

## Adapting for Real Hardware

To use real hardware instead of the mock adapter, replace `MockAdapter` with the appropriate adapter:

```typescript
import { LedgerAdapter } from '@solana-hw-wallet/adapter-ledger';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';

const sdk = createHardwareWalletSdk({
  adapters: [
    new LedgerAdapter({
      transportFactory: () => TransportNodeHid.create(),
    }),
  ],
});
```
