/**
 * Example: Sign a Solana transaction with a hardware wallet.
 *
 * Demonstrates:
 * - Building a Solana transaction
 * - Serializing for hardware wallet signing
 * - Applying the signature back to the transaction
 * - Error handling (user rejection, unsupported features)
 *
 * Usage:
 *   pnpm --filter @solana-hw-wallet/examples-node example:sign-transaction
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { createHardwareWalletSdk } from '@solana-hw-wallet/core';
import { MockAdapter } from '@solana-hw-wallet/test-utils';
import {
  serializeTransaction,
  addSignatureToTransaction,
} from '@solana-hw-wallet/solana';

async function main() {
  console.log('=== Sign Solana Transaction with Hardware Wallet ===\n');

  const adapter = new MockAdapter({ name: 'Demo Wallet' });
  const sdk = createHardwareWalletSdk({ adapters: [adapter] });

  // Connect and get account
  await sdk.connect('mock');
  const account = await sdk.getPublicKey(0);
  console.log('Signer:', account.address);

  // Build a transaction (SOL transfer)
  // NOTE: In production, use a real RPC connection for blockhash
  const senderPubkey = new PublicKey(account.publicKey);
  const recipientPubkey = new PublicKey(new Uint8Array(32).fill(2)); // dummy recipient

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: senderPubkey,
      toPubkey: recipientPubkey,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    }),
  );

  // In production, fetch a real recent blockhash:
  // const connection = new Connection('https://api.mainnet-beta.solana.com');
  // const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
  transaction.feePayer = senderPubkey;

  // Serialize the transaction for signing
  console.log('\nSerializing transaction...');
  const serializedMessage = serializeTransaction(transaction);
  console.log('Serialized message size:', serializedMessage.length, 'bytes');

  // Sign with the hardware wallet
  console.log('Requesting signature from hardware wallet...');
  const { signature } = await sdk.signTransaction(serializedMessage, account.derivationPath);
  console.log('Signature:', Buffer.from(signature).toString('hex').slice(0, 32) + '...');

  // Add the signature back to the transaction
  const signedTx = addSignatureToTransaction(transaction, senderPubkey, signature);
  console.log('\nTransaction signed successfully!');
  console.log('Signatures:', signedTx.signatures.length);

  // In production, you would now send the signed transaction:
  // const txId = await connection.sendRawTransaction(signedTx.serialize());
  // console.log('Transaction sent:', txId);

  console.log('\n(Skipping broadcast — this is a demo with mock data)');

  // Error handling demo
  console.log('\n--- Error Handling Demo ---');
  adapter.setBehavior({ rejectSigning: true });
  try {
    await sdk.signTransaction(serializedMessage, account.derivationPath);
  } catch (err) {
    const sdkErr = err as import('@solana-hw-wallet/core').SdkError;
    console.log('Caught error:', sdkErr.message);
    console.log('Error code:', sdkErr.code);
    console.log('Is cancellation:', sdkErr.isCancellation);
    console.log('Is recoverable:', sdkErr.isRecoverable);
  }

  await sdk.disconnect();
  await sdk.dispose();
  console.log('\nDone!');
}

main().catch(console.error);
