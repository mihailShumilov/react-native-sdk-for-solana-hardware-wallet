/**
 * Example: Derive Solana accounts from a hardware wallet.
 *
 * This example demonstrates:
 * - Creating the SDK with adapters
 * - Connecting to a wallet
 * - Deriving multiple accounts
 *
 * Usage:
 *   pnpm --filter @solana-hw-wallet/examples-node example:derive
 *
 * By default, uses the MockAdapter for demonstration.
 * Replace with a real adapter (e.g., LedgerAdapter) for actual hardware testing.
 */

import { createHardwareWalletSdk } from '@solana-hw-wallet/core';
import { MockAdapter } from '@solana-hw-wallet/test-utils';
import { getSolanaDerivationPath } from '@solana-hw-wallet/solana';

async function main() {
  console.log('=== Derive Solana Accounts from Hardware Wallet ===\n');

  // Create a mock adapter for demonstration
  // Replace with: new LedgerAdapter({ transportFactory: ... })
  const adapter = new MockAdapter({ name: 'Demo Wallet' });

  const sdk = createHardwareWalletSdk({
    adapters: [adapter],
  });

  console.log('Registered adapters:', sdk.registeredAdapters);

  // Connect
  console.log('\nConnecting...');
  await sdk.connect('mock');
  console.log('Connected! State:', sdk.connectionState);

  // Derive single account (default)
  console.log('\n--- Single Account ---');
  const singleAccount = await sdk.getPublicKey(0);
  console.log('Address:', singleAccount.address);
  console.log('Path:', singleAccount.derivationPath);

  // Derive multiple accounts
  console.log('\n--- Multiple Accounts (5) ---');
  const accounts = await sdk.getAccounts({ count: 5, startIndex: 0 });
  for (const account of accounts) {
    console.log(`  [${account.index}] ${account.address} (${account.derivationPath})`);
  }

  // Show derivation path helpers
  console.log('\n--- Derivation Paths ---');
  for (let i = 0; i < 3; i++) {
    console.log(`  Account ${i}: ${getSolanaDerivationPath(i)}`);
  }

  // Disconnect
  await sdk.disconnect();
  console.log('\nDisconnected. Done!');

  await sdk.dispose();
}

main().catch(console.error);
