/**
 * UR (Uniform Resource) codec for Keystone QR communication.
 *
 * This module handles encoding/decoding of UR-formatted data used by
 * Keystone hardware wallets for air-gapped QR code communication.
 *
 * The Keystone uses the Blockchain Commons UR standard:
 * - Account sync: ur:crypto-multi-accounts
 * - Sign request: ur:sol-sign-request
 * - Sign response: ur:sol-signature
 *
 * TODO: Full UR encoding/decoding requires @ngraveio/bc-ur and
 * @keystonehq/sol-keyring. This implementation provides the codec
 * interface with fallback behavior when those libraries are not available.
 *
 * For production use, install:
 *   pnpm add @keystonehq/sol-keyring @ngraveio/bc-ur
 */

import type { DerivedAccount } from '@solana-hw-wallet/shared';

/**
 * Encode a Solana transaction signing request as UR data.
 *
 * @param transaction - Serialized transaction bytes
 * @param derivationPath - BIP44 derivation path
 * @returns UR-encoded string for QR display
 */
export function encodeSignRequest(transaction: Uint8Array, derivationPath: string): string {
  // TODO: Implement full UR encoding using @keystonehq/sol-keyring
  // For now, use a structured hex format that can be decoded by the test harness
  const payload = {
    type: 'sol-sign-request',
    transaction: Buffer.from(transaction).toString('hex'),
    derivationPath,
  };
  return JSON.stringify(payload);
}

/**
 * Decode a signed response from Keystone QR scan.
 *
 * @param qrData - The scanned QR data
 * @returns The signature bytes
 */
export function decodeSignResponse(qrData: string): Uint8Array {
  // TODO: Implement full UR decoding using @keystonehq/sol-keyring
  try {
    const parsed = JSON.parse(qrData);
    if (parsed.signature) {
      return new Uint8Array(Buffer.from(parsed.signature, 'hex'));
    }
  } catch {
    // Try direct hex decode
  }

  return new Uint8Array(Buffer.from(qrData, 'hex'));
}

/**
 * Decode account sync data from a Keystone QR code.
 *
 * @param qrData - The scanned QR data containing account information
 * @returns Array of derived accounts
 */
export function decodeAccountSync(qrData: string): DerivedAccount[] {
  // TODO: Implement full UR decoding for crypto-multi-accounts
  const parsed = JSON.parse(qrData);

  if (Array.isArray(parsed.accounts)) {
    return parsed.accounts.map(
      (
        account: { address: string; publicKey: string; derivationPath: string; index: number },
        i: number,
      ) => ({
        address: account.address,
        publicKey: new Uint8Array(Buffer.from(account.publicKey, 'hex')),
        derivationPath: account.derivationPath,
        index: account.index ?? i,
      }),
    );
  }

  throw new Error('Invalid account sync data format');
}
