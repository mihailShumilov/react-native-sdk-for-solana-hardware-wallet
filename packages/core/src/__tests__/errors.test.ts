import { describe, it, expect } from 'vitest';
import { SdkError, SdkErrorCode, wrapError } from '../errors.js';

describe('SdkError', () => {
  it('creates error with code and message', () => {
    const err = new SdkError(SdkErrorCode.NotConnected, 'Not connected');
    expect(err.code).toBe(SdkErrorCode.NotConnected);
    expect(err.message).toBe('Not connected');
    expect(err.name).toBe('SdkError');
  });

  it('includes wallet type', () => {
    const err = new SdkError(SdkErrorCode.WalletAppNotOpen, 'Open app', {
      walletType: 'ledger',
    });
    expect(err.walletType).toBe('ledger');
  });

  it('isCancellation returns true for user cancellations', () => {
    const cancelled = new SdkError(SdkErrorCode.UserCancelled, 'Cancelled');
    const rejected = new SdkError(SdkErrorCode.WalletRejected, 'Rejected');
    const other = new SdkError(SdkErrorCode.Unknown, 'Unknown');

    expect(cancelled.isCancellation).toBe(true);
    expect(rejected.isCancellation).toBe(true);
    expect(other.isCancellation).toBe(false);
  });

  it('isRecoverable returns true for recoverable errors', () => {
    const timeout = new SdkError(SdkErrorCode.ConnectionTimeout, 'Timeout');
    const appNotOpen = new SdkError(SdkErrorCode.WalletAppNotOpen, 'App not open');
    const unknown = new SdkError(SdkErrorCode.Unknown, 'Unknown');

    expect(timeout.isRecoverable).toBe(true);
    expect(appNotOpen.isRecoverable).toBe(true);
    expect(unknown.isRecoverable).toBe(false);
  });

  it('serializes to JSON correctly', () => {
    const err = new SdkError(SdkErrorCode.NotConnected, 'msg', { walletType: 'ledger' });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'SdkError',
      code: 'NOT_CONNECTED',
      message: 'msg',
      walletType: 'ledger',
    });
  });
});

describe('wrapError', () => {
  it('returns SdkError as-is', () => {
    const err = new SdkError(SdkErrorCode.Unknown, 'test');
    expect(wrapError(err)).toBe(err);
  });

  it('wraps regular Error', () => {
    const err = wrapError(new Error('something'), 'ledger');
    expect(err).toBeInstanceOf(SdkError);
    expect(err.code).toBe(SdkErrorCode.Unknown);
    expect(err.message).toBe('something');
    expect(err.walletType).toBe('ledger');
  });

  it('wraps string errors', () => {
    const err = wrapError('string error');
    expect(err).toBeInstanceOf(SdkError);
    expect(err.message).toBe('string error');
  });
});
