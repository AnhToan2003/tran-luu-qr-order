/**
 * Integration Test: RBAC Matrix — Every Endpoint With Every Role (Issue #6)
 *
 * Verifies that backend enforces permissions correctly.
 * Frontend tab hiding is NOT sufficient — backend must enforce.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../../server/app.js';
import { hashPassword } from '../../server/auth.js';

let replSet: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;

// Token cookies for different roles
let adminCookie: string;
let orderOnlyCookie: string;   // Only has 'orders' permission
let historyOnlyCookie: string; // Only has 'order-history' permission
let rbacOnlyCookie: string;     // RBAC management without full admin
let targetAdminUserId: string;
let proofCounter = 0;

async function issueProof(cookie: string, action = 'rbac.manage'): Promise<string> {
  const res = await request(app)
    .post('/api/admin/auth/verify-action-password')
    .set('Cookie', cookie)
    .set('X-Forwarded-For', `198.51.100.${++proofCounter}`)
    .send({ password: 'AdminPass123!', action });
  return res.body.proofToken;
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();

  process.env.MONGO_URI = uri;
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD_HASH = await hashPassword('AdminPass123!');
  process.env.COOKIE_SECRET = 'test-cookie-secret-long-enough-here';
  process.env.REDIS_ENABLED = 'false';

  const { connectToDatabase } = await import('../../server/db.js');
  await connectToDatabase();

  app = createApp();

  // Login as superadmin (ENV admin)
  const adminLogin = await request(app)
    .post('/api/admin/auth/login')
    .send({ username: 'admin', password: 'AdminPass123!' });
  const adminCookieHeader = adminLogin.headers['set-cookie'];
  adminCookie = Array.isArray(adminCookieHeader) ? adminCookieHeader[0] : adminCookieHeader;

  // Create roles and limited users via RBAC (as superadmin)
  // Create 'order-only' role
  await request(app)
    .post('/api/admin/rbac/roles')
    .set('Cookie', adminCookie)
    .set('x-action-proof', await issueProof(adminCookie))
    .send({ name: 'Order Only', description: 'Only orders', permissions: ['orders'] });

  const rolesRes = await request(app)
    .get('/api/admin/rbac/roles')
    .set('Cookie', adminCookie);
  const orderRole = rolesRes.body.roles?.find((r: any) => r.name === 'Order Only');

  if (orderRole) {
    await request(app)
      .post('/api/admin/rbac/users')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({
        username: 'orderuser',
        fullName: 'Order User',
        password: 'OrderUser123!',
        roleId: orderRole.roleId
      });

    const orderLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'orderuser', password: 'OrderUser123!' });
    const c = orderLogin.headers['set-cookie'];
    orderOnlyCookie = Array.isArray(c) ? c[0] : c;
  }

  // Create 'history-only' role
  await request(app)
    .post('/api/admin/rbac/roles')
    .set('Cookie', adminCookie)
    .set('x-action-proof', await issueProof(adminCookie))
    .send({ name: 'History Only', description: 'Only history', permissions: ['order-history'] });

  const rolesRes2 = await request(app)
    .get('/api/admin/rbac/roles')
    .set('Cookie', adminCookie);
  const historyRole = rolesRes2.body.roles?.find((r: any) => r.name === 'History Only');

  if (historyRole) {
    await request(app)
      .post('/api/admin/rbac/users')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({
        username: 'historyuser',
        fullName: 'History User',
        password: 'HistoryUser123!',
        roleId: historyRole.roleId
      });

    const historyLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'historyuser', password: 'HistoryUser123!' });
    const c = historyLogin.headers['set-cookie'];
    historyOnlyCookie = Array.isArray(c) ? c[0] : c;
  }

  // Create a manager with only the RBAC permission and a separate admin-role
  // target. These accounts exercise the privilege-escalation boundary.
  await request(app)
    .post('/api/admin/rbac/roles')
    .set('Cookie', adminCookie)
    .set('x-action-proof', await issueProof(adminCookie))
    .send({ name: 'RBAC Only', description: 'User management only', permissions: ['rbac'] });
  const rolesRes3 = await request(app)
    .get('/api/admin/rbac/roles')
    .set('Cookie', adminCookie);
  const rbacRole = rolesRes3.body.roles?.find((r: any) => r.name === 'RBAC Only');
  if (rbacRole) {
    await request(app)
      .post('/api/admin/rbac/users')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({ username: 'rbacmanager', fullName: 'RBAC Manager', password: 'RbacManager123!', roleId: rbacRole.roleId });

    const targetRes = await request(app)
      .post('/api/admin/rbac/users')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({ username: 'targetadmin', fullName: 'Target Admin', password: 'TargetAdmin123!', roleId: 'admin' });
    targetAdminUserId = targetRes.body.user?.userId;

    const managerLogin = await request(app)
      .post('/api/admin/auth/login')
      .send({ username: 'rbacmanager', password: 'RbacManager123!' });
    const c = managerLogin.headers['set-cookie'];
    rbacOnlyCookie = Array.isArray(c) ? c[0] : c;
  }
}, 90_000);

afterAll(async () => {
  await replSet?.stop();
}, 30_000);

// =============================================================================
// Issue #6: RBAC Matrix Tests
// =============================================================================

describe('P1 Issue #6: RBAC — GET /products permission enforcement', () => {
  it('superadmin can GET /products', async () => {
    const res = await request(app)
      .get('/api/admin/products')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('REGRESSION: user with only order-history cannot GET /products', async () => {
    if (!historyOnlyCookie) return; // Skip if role setup failed

    const res = await request(app)
      .get('/api/admin/products')
      .set('Cookie', historyOnlyCookie);

    // Must be 403, not 200
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('user with orders permission CAN GET /products', async () => {
    if (!orderOnlyCookie) return;

    const res = await request(app)
      .get('/api/admin/products')
      .set('Cookie', orderOnlyCookie);

    expect(res.status).toBe(200);
  });
});

describe('P1 Issue #6: RBAC — GET /categories permission enforcement', () => {
  it('REGRESSION: user with only order-history cannot GET /categories', async () => {
    if (!historyOnlyCookie) return;

    const res = await request(app)
      .get('/api/admin/categories')
      .set('Cookie', historyOnlyCookie);

    expect(res.status).toBe(403);
  });

  it('user with orders permission CAN GET /categories', async () => {
    if (!orderOnlyCookie) return;

    const res = await request(app)
      .get('/api/admin/categories')
      .set('Cookie', orderOnlyCookie);

    expect(res.status).toBe(200);
  });
});

describe('P1 Issue #6: RBAC — GET /courts permission enforcement', () => {
  it('REGRESSION: user with only orders cannot GET /courts (needs courts permission)', async () => {
    if (!orderOnlyCookie) return;

    const res = await request(app)
      .get('/api/admin/courts')
      .set('Cookie', orderOnlyCookie);

    expect(res.status).toBe(403);
  });

  it('superadmin CAN GET /courts', async () => {
    const res = await request(app)
      .get('/api/admin/courts')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
  });
});

describe('P1 Issue #7: RBAC — Invalid permission rejection', () => {
  it('cannot create role with non-existent permission', async () => {
    const res = await request(app)
      .post('/api/admin/rbac/roles')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({
        name: 'Invalid Role',
        description: 'Has fake permission',
        permissions: ['not-a-real-permission']
      });

    expect(res.status).toBe(400);
  });

  it('cannot create role with wildcard (*) permission', async () => {
    const res = await request(app)
      .post('/api/admin/rbac/roles')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({
        name: 'Wildcard Role',
        description: 'Tries to be admin',
        permissions: ['*']
      });

    expect(res.status).toBe(400);
  });

  it('can create role with all valid permissions', async () => {
    const res = await request(app)
      .post('/api/admin/rbac/roles')
      .set('Cookie', adminCookie)
      .set('x-action-proof', await issueProof(adminCookie))
      .send({
        name: 'Full Role Test',
        description: 'All valid permissions',
        permissions: ['orders', 'courts', 'backup']
      });

    expect(res.status).toBe(201);
  });
});

describe('P0 RBAC privilege-escalation regression', () => {
  it('RBAC-only manager cannot reset an admin-role password', async () => {
    if (!rbacOnlyCookie || !targetAdminUserId) return;
    const res = await request(app)
      .put(`/api/admin/rbac/users/${targetAdminUserId}/password`)
      .set('Cookie', rbacOnlyCookie)
      .set('x-action-proof', await issueProof(rbacOnlyCookie))
      .send({ newPassword: 'NewTargetAdmin123!' });

    expect(res.status).toBe(403);
    expect(['PROTECTED_USER', 'PERMISSION_ESCALATION']).toContain(res.body.code);
  });

  it('RBAC-only manager cannot delete an admin-role account', async () => {
    if (!rbacOnlyCookie || !targetAdminUserId) return;
    const res = await request(app)
      .delete(`/api/admin/rbac/users/${targetAdminUserId}`)
      .set('Cookie', rbacOnlyCookie)
      .set('x-action-proof', await issueProof(rbacOnlyCookie));

    expect(res.status).toBe(403);
  });

  it('RBAC-only manager cannot create a new admin-role account', async () => {
    if (!rbacOnlyCookie) return;
    const res = await request(app)
      .post('/api/admin/rbac/users')
      .set('Cookie', rbacOnlyCookie)
      .set('x-action-proof', await issueProof(rbacOnlyCookie))
      .send({ username: 'escalationtarget', fullName: 'Escalation Target', password: 'Escalation123!', roleId: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_ESCALATION');
  });
});
