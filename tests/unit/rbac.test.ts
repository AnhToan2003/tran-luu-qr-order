import { describe, it, expect } from 'vitest';
import { SYSTEM_PERMISSIONS } from '../../server/types.js';
import { z } from 'zod';

// =============================================================================
// Unit Tests: RBAC — Permission Validation (Issue #7)
// =============================================================================

const VALID_PERMISSION_IDS = SYSTEM_PERMISSIONS.map(p => p.id) as [string, ...string[]];

const permissionsSchema = z.array(
  z.enum(VALID_PERMISSION_IDS as [typeof VALID_PERMISSION_IDS[0], ...typeof VALID_PERMISSION_IDS[0][]])
)
  .transform(arr => [...new Set(arr)])   // Deduplicate FIRST (consistent with rbacRoutes.ts)
  .refine(arr => arr.length >= 1, 'Vai trò phải có ít nhất 1 quyền');

describe('RBAC Permission Validation (Issue #7)', () => {
  it('accepts all known system permissions', () => {
    const validPerms = SYSTEM_PERMISSIONS.map(p => p.id);
    expect(() => permissionsSchema.parse(validPerms)).not.toThrow();
  });

  it('rejects unknown/arbitrary permission strings', () => {
    expect(() => permissionsSchema.parse(['not-a-real-permission'])).toThrow();
    expect(() => permissionsSchema.parse(['admin-all'])).toThrow();
    expect(() => permissionsSchema.parse(['*'])).toThrow();
  });

  it('rejects empty permission array', () => {
    expect(() => permissionsSchema.parse([])).toThrow();
  });

  it('deduplicates repeated permissions (no error for duplicates)', () => {
    // Schema now transforms duplicates rather than rejecting them
    const result = permissionsSchema.parse(['orders', 'orders', 'courts']);
    expect(result).toEqual(['orders', 'courts']);
    expect(result.length).toBe(2);
  });

  it('accepts single valid permission', () => {
    expect(() => permissionsSchema.parse(['orders'])).not.toThrow();
  });

  it('rejects null/undefined in permission list', () => {
    expect(() => permissionsSchema.parse([null])).toThrow();
    expect(() => permissionsSchema.parse([undefined])).toThrow();
  });

  it('rejects mixed valid+invalid permissions', () => {
    // If even one permission is invalid, the whole array should be rejected
    expect(() => permissionsSchema.parse(['orders', 'fake-permission'])).toThrow();
  });
});

describe('SYSTEM_PERMISSIONS completeness', () => {
  const requiredPermissions = [
    'orders', 'sports-pos', 'drink-intake', 'sports-intake',
    'intake-history', 'order-history', 'sports-order-history',
    'revenue-report', 'courts', 'backup', 'rbac'
  ];

  it('contains all required permissions', () => {
    const ids = SYSTEM_PERMISSIONS.map(p => p.id);
    for (const perm of requiredPermissions) {
      expect(ids).toContain(perm);
    }
  });

  it('each permission has id, name, category, description', () => {
    for (const perm of SYSTEM_PERMISSIONS) {
      expect(perm.id).toBeTruthy();
      expect(perm.name).toBeTruthy();
      expect(perm.category).toBeTruthy();
      expect(perm.description).toBeTruthy();
    }
  });

  it('no duplicate permission IDs', () => {
    const ids = SYSTEM_PERMISSIONS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
