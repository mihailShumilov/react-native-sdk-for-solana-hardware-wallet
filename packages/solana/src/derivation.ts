/**
 * Solana BIP44 derivation path utilities.
 *
 * Standard Solana derivation path: m/44'/501'/{account}'/{change}'
 * - Coin type 501 = Solana (registered in SLIP-0044)
 * - Account index is typically 0-based
 * - Change index is typically 0 (external) or 1 (internal), usually 0 for Solana
 */

/** Solana coin type per SLIP-0044 */
export const SOLANA_COIN_TYPE = 501;

/** Default purpose (BIP44) */
export const BIP44_PURPOSE = 44;

/**
 * Build a standard Solana BIP44 derivation path.
 *
 * @param accountIndex - The account index (default: 0)
 * @param changeIndex - The change index (default: 0)
 * @returns The derivation path string, e.g., "m/44'/501'/0'/0'"
 */
export function getSolanaDerivationPath(accountIndex = 0, changeIndex = 0): string {
  validateIndex(accountIndex, 'accountIndex');
  validateIndex(changeIndex, 'changeIndex');
  return `m/${BIP44_PURPOSE}'/${SOLANA_COIN_TYPE}'/${accountIndex}'/${changeIndex}'`;
}

/**
 * Build multiple derivation paths for account enumeration.
 *
 * @param count - Number of paths to generate
 * @param startIndex - Starting account index (default: 0)
 * @param changeIndex - Change index to use for all paths (default: 0)
 */
export function getSolanaDerivationPaths(
  count: number,
  startIndex = 0,
  changeIndex = 0,
): string[] {
  return Array.from({ length: count }, (_, i) =>
    getSolanaDerivationPath(startIndex + i, changeIndex),
  );
}

/**
 * Parse a Solana derivation path and extract indices.
 *
 * @param path - The derivation path string
 * @returns Parsed path components
 * @throws Error if the path is not a valid Solana derivation path
 */
export function parseSolanaDerivationPath(path: string): {
  purpose: number;
  coinType: number;
  accountIndex: number;
  changeIndex: number;
} {
  // Match patterns like m/44'/501'/0'/0' (with or without trailing hardened markers)
  const match = path.match(/^m\/(\d+)'\/(\d+)'\/(\d+)'(?:\/(\d+)'?)?$/);
  if (!match) {
    throw new Error(`Invalid Solana derivation path: ${path}`);
  }

  const purpose = parseInt(match[1], 10);
  const coinType = parseInt(match[2], 10);
  const accountIndex = parseInt(match[3], 10);
  const changeIndex = match[4] ? parseInt(match[4], 10) : 0;

  if (coinType !== SOLANA_COIN_TYPE) {
    throw new Error(`Expected coin type ${SOLANA_COIN_TYPE}, got ${coinType}`);
  }

  return { purpose, coinType, accountIndex, changeIndex };
}

/**
 * Convert a derivation path to a Uint32Array of BIP32 path components.
 * Each hardened index has 0x80000000 added.
 */
export function derivationPathToBuffer(path: string): number[] {
  const components = path
    .replace('m/', '')
    .split('/')
    .map((component) => {
      const hardened = component.endsWith("'");
      const index = parseInt(hardened ? component.slice(0, -1) : component, 10);
      return hardened ? index + 0x80000000 : index;
    });

  return components;
}

function validateIndex(index: number, name: string): void {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) {
    throw new Error(`Invalid ${name}: ${index}. Must be a non-negative integer.`);
  }
}
