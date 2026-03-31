import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/**
 * Serialize a legacy Transaction for hardware wallet signing.
 * Returns the serialized message that needs to be signed.
 */
export function serializeTransaction(transaction: Transaction): Uint8Array {
  return transaction.serializeMessage();
}

/**
 * Serialize a VersionedTransaction for hardware wallet signing.
 * Returns the serialized message that needs to be signed.
 */
export function serializeVersionedTransaction(transaction: VersionedTransaction): Uint8Array {
  return transaction.message.serialize();
}

/**
 * Add a signature to a legacy Transaction.
 */
export function addSignatureToTransaction(
  transaction: Transaction,
  publicKey: PublicKey,
  signature: Uint8Array,
): Transaction {
  transaction.addSignature(publicKey, Buffer.from(signature));
  return transaction;
}

/**
 * Add a signature to a VersionedTransaction.
 */
export function addSignatureToVersionedTransaction(
  transaction: VersionedTransaction,
  publicKey: PublicKey,
  signature: Uint8Array,
): VersionedTransaction {
  const signerIndex = transaction.message.staticAccountKeys.findIndex((key) =>
    key.equals(publicKey),
  );
  if (signerIndex === -1) {
    throw new Error('Public key not found in transaction account keys');
  }
  transaction.signatures[signerIndex] = signature;
  return transaction;
}

/**
 * Check if a value is a VersionedTransaction.
 */
export function isVersionedTransaction(
  tx: Transaction | VersionedTransaction,
): tx is VersionedTransaction {
  return 'version' in tx && tx.version !== undefined;
}

/**
 * Create a PublicKey from bytes.
 */
export function publicKeyFromBytes(bytes: Uint8Array): PublicKey {
  return new PublicKey(bytes);
}
