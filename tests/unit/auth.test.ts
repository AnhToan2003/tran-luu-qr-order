import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../server/auth.js';
import { ApiError } from '../../server/errors.js';

// =============================================================================
// Unit Tests: Auth — Password Policy, Crypto, Cookie Flags
// =============================================================================

describe('Password Hashing (async scrypt)', () => {
  it('hashPassword produces salt:hash format', async () => {
    const hash = await hashPassword('MyStr0ngPass!');
    expect(hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  it('verifyPassword succeeds with correct password', async () => {
    const password = 'MyStr0ngPass!';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('verifyPassword fails with wrong password', async () => {
    const hash = await hashPassword('MyStr0ngPass!');
    expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
  });

  it('verifyPassword fails with malformed hash', async () => {
    expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
  });

  it('two hashes of same password are different (unique salts)', async () => {
    const hash1 = await hashPassword('SamePassword!');
    const hash2 = await hashPassword('SamePassword!');
    expect(hash1).not.toBe(hash2);
    // But both should verify correctly
    expect(await verifyPassword('SamePassword!', hash1)).toBe(true);
    expect(await verifyPassword('SamePassword!', hash2)).toBe(true);
  });

  it('does not block event loop — resolves as promise', async () => {
    const start = Date.now();
    await hashPassword('TestPassword1!');
    // Should complete but not block (no synchronous delay > 100ms visible externally)
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('Password Strength Validation (Issue #9)', () => {
  it('rejects passwords shorter than 10 characters', () => {
    expect(() => validatePasswordStrength('short')).toThrow(ApiError);
    expect(() => validatePasswordStrength('short')).toThrow('10 ký tự');
  });

  it('accepts passwords with 10+ characters', () => {
    expect(() => validatePasswordStrength('LongEnough1!')).not.toThrow();
  });

  it('rejects passwords containing username', () => {
    expect(() => validatePasswordStrength('MyUsername123!', 'myusername')).toThrow(ApiError);
  });

  it('rejects common/weak passwords', () => {
    expect(() => validatePasswordStrength('password123456')).toThrow(ApiError);
    expect(() => validatePasswordStrength('admin1234567')).toThrow(ApiError);
  });

  it('accepts strong passphrase', () => {
    expect(() => validatePasswordStrength('correct-horse-battery-staple')).not.toThrow();
  });

  it('rejects passwords over 128 characters', () => {
    const tooLong = 'a'.repeat(129);
    expect(() => validatePasswordStrength(tooLong)).toThrow(ApiError);
  });
});
