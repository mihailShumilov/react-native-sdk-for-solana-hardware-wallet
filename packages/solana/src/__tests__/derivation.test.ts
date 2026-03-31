import { describe, it, expect } from 'vitest';
import {
  getSolanaDerivationPath,
  getSolanaDerivationPaths,
  parseSolanaDerivationPath,
  derivationPathToBuffer,
  SOLANA_COIN_TYPE,
  BIP44_PURPOSE,
} from '../derivation.js';

describe('getSolanaDerivationPath', () => {
  it('returns default path for no arguments', () => {
    expect(getSolanaDerivationPath()).toBe("m/44'/501'/0'/0'");
  });

  it('generates path with account index', () => {
    expect(getSolanaDerivationPath(3)).toBe("m/44'/501'/3'/0'");
  });

  it('generates path with account and change index', () => {
    expect(getSolanaDerivationPath(1, 1)).toBe("m/44'/501'/1'/1'");
  });

  it('throws for negative account index', () => {
    expect(() => getSolanaDerivationPath(-1)).toThrow('Invalid accountIndex');
  });

  it('throws for non-integer index', () => {
    expect(() => getSolanaDerivationPath(1.5)).toThrow('Invalid accountIndex');
  });
});

describe('getSolanaDerivationPaths', () => {
  it('generates multiple paths', () => {
    const paths = getSolanaDerivationPaths(3);
    expect(paths).toEqual([
      "m/44'/501'/0'/0'",
      "m/44'/501'/1'/0'",
      "m/44'/501'/2'/0'",
    ]);
  });

  it('generates paths from start index', () => {
    const paths = getSolanaDerivationPaths(2, 5);
    expect(paths).toEqual([
      "m/44'/501'/5'/0'",
      "m/44'/501'/6'/0'",
    ]);
  });
});

describe('parseSolanaDerivationPath', () => {
  it('parses a valid path', () => {
    const result = parseSolanaDerivationPath("m/44'/501'/0'/0'");
    expect(result).toEqual({
      purpose: BIP44_PURPOSE,
      coinType: SOLANA_COIN_TYPE,
      accountIndex: 0,
      changeIndex: 0,
    });
  });

  it('parses path with higher indices', () => {
    const result = parseSolanaDerivationPath("m/44'/501'/5'/1'");
    expect(result).toEqual({
      purpose: 44,
      coinType: 501,
      accountIndex: 5,
      changeIndex: 1,
    });
  });

  it('throws for invalid path format', () => {
    expect(() => parseSolanaDerivationPath('invalid')).toThrow('Invalid Solana derivation path');
  });

  it('throws for wrong coin type', () => {
    expect(() => parseSolanaDerivationPath("m/44'/60'/0'/0'")).toThrow('Expected coin type 501');
  });
});

describe('derivationPathToBuffer', () => {
  it('converts path to buffer with hardened indices', () => {
    const result = derivationPathToBuffer("m/44'/501'/0'/0'");
    expect(result).toEqual([
      44 + 0x80000000,
      501 + 0x80000000,
      0 + 0x80000000,
      0 + 0x80000000,
    ]);
  });

  it('handles mixed hardened/unhardened components', () => {
    const result = derivationPathToBuffer("m/44'/501'/0'/0");
    expect(result).toEqual([
      44 + 0x80000000,
      501 + 0x80000000,
      0 + 0x80000000,
      0,
    ]);
  });
});
