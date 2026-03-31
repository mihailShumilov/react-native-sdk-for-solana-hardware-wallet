/**
 * Example: Sign a message with a hardware wallet.
 *
 * Demonstrates:
 * - Message signing flow
 * - Error handling for unsupported features
 * - Using the SDK event system
 *
 * Usage:
 *   pnpm --filter @solana-hw-wallet/examples-node example:sign-message
 */

import { createHardwareWalletSdk, SdkEvent } from '@solana-hw-wallet/core';
import { MockAdapter } from '@solana-hw-wallet/test-utils';

async function main() {
  console.log('=== Sign Message with Hardware Wallet ===\n');

  const adapter = new MockAdapter({ name: 'Demo Wallet' });

  const sdk = createHardwareWalletSdk({
    adapters: [adapter],
  });

  // Listen for events
  sdk.on(SdkEvent.ConnectionStateChanged, ({ state, previousState }) => {
    console.log(`  [Event] Connection: ${previousState} -> ${state}`);
  });

  sdk.on(SdkEvent.Error, ({ error, context }) => {
    console.log(`  [Event] Error: ${error.message} (${context})`);
  });

  // Connect
  await sdk.connect('mock');

  // Get the account to sign with
  const account = await sdk.getPublicKey(0);
  console.log('Signing with account:', account.address);
  console.log('Derivation path:', account.derivationPath);

  // Sign a plain text message
  const message = new TextEncoder().encode('Hello, Solana! This is signed by a hardware wallet.');
  console.log('\nMessage:', new TextDecoder().decode(message));
  console.log('Message bytes:', message.length);

  const result = await sdk.signMessage(message, account.derivationPath);
  console.log('\nSignature:', Buffer.from(result.signature).toString('hex'));
  console.log('Signature length:', result.signature.length, 'bytes');

  // Sign a SIWS-style message
  const siwsMessage = new TextEncoder().encode(
    `example.com wants you to sign in with your Solana account:\n${account.address}\n\nPlease sign to verify ownership.\n\nURI: https://example.com\nVersion: 1\nChain ID: mainnet\nNonce: abc123\nIssued At: 2026-03-31T00:00:00Z`,
  );
  console.log('\n--- SIWS-style Message ---');
  console.log(new TextDecoder().decode(siwsMessage));

  const siwsResult = await sdk.signMessage(siwsMessage, account.derivationPath);
  console.log('SIWS Signature:', Buffer.from(siwsResult.signature).toString('hex'));

  // Clean up
  await sdk.disconnect();
  await sdk.dispose();
  console.log('\nDone!');
}

main().catch(console.error);
