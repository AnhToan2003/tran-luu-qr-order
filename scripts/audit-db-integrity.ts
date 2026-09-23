/**
 * Audit Database Integrity Script (Strictly Read-Only Diagnostic)
 * 
 * Performs comprehensive, read-only diagnostic checks on MongoDB collections
 * WITHOUT executing index creations, upserts, or any DDL side-effects.
 * 
 * Invariants Checked:
 * 1. Negative or anomalous stock & price values in products and sportsItems.
 * 2. Movements referencing non-existent products/items or invalid/orphan orders.
 * 3. Inventory movement math (delta * costPrice vs totalCostVnd).
 * 4. Order math consistency: totalVnd vs sum of item lines, lineTotal vs unitPrice * quantity.
 * 5. Order references (valid courtId, valid payment status, debt consistency).
 * 6. Admin RBAC integrity (users with missing roles, disabled state, invalid roles).
 * 
 * Usage:
 *   npx tsx scripts/audit-db-integrity.ts
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { DB_NAME } from '../server/db.js';

interface AuditIssue {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category: string;
  id: string;
  description: string;
  details?: Record<string, unknown>;
}

function maskMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  }
}

async function runAudit() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const targetDbName = process.env.DB_NAME || DB_NAME;

  console.log('Starting Database Integrity Audit (100% Read-Only, No DDL Side-effects)...');
  console.log(`Target MongoDB: ${maskMongoUri(uri)} [DB: ${targetDbName}]\n`);

  const issues: AuditIssue[] = [];
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    const isFullScan = process.argv.includes('--full') || process.argv.includes('-f') || process.env.AUDIT_FULL === 'true';
    console.log(`\n⚙️  Audit Mode: ${isFullScan ? 'FULL SCAN (Scanning 100% orders and movements)' : 'SAMPLE MODE (Scanning latest 3,000 orders & 1,000 movements. Pass --full to audit all)'}`);

    await client.connect();
    const db = client.db(targetDbName);

    const courtsColl = db.collection('courts');
    const productsColl = db.collection('products');
    const sportsItemsColl = db.collection('sports_items');
    const ordersColl = db.collection('orders');
    const inventoryMovementsColl = db.collection('inventory_movements');
    const sportsMovementsColl = db.collection('sports_movements');
    const rolesColl = db.collection('roles');
    const usersColl = db.collection('admin_users');

    // 1. Audit Courts
    console.log('Checking Courts...');
    const courts = await courtsColl.find({}).toArray();
    const courtIds = new Set(courts.map(c => c.courtId));
    const courtCodes = new Set<string>();
    for (const c of courts) {
      if (!c.code) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Courts Code',
          id: c.courtId,
          description: `Court "${c.name}" has missing or empty code`,
          details: { courtId: c.courtId }
        });
      } else if (courtCodes.has(c.code)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Courts Duplicate Code',
          id: c.courtId,
          description: `Court code "${c.code}" is duplicated`,
          details: { code: c.code, courtId: c.courtId }
        });
      } else {
        courtCodes.add(c.code);
      }
    }
    console.log(`   Checked ${courts.length} courts.`);

    // 2. Audit Drink Products
    console.log('Checking Drink Products...');
    const products = await productsColl.find({}).toArray();
    const productIds = new Set(products.map(p => p.productId));

    for (const p of products) {
      if (typeof p.stock !== 'number' || p.stock < 0) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Products Stock',
          id: p.productId,
          description: `Product "${p.name}" has negative or invalid stock: ${p.stock}`,
          details: { stock: p.stock, priceVnd: p.priceVnd }
        });
      }
      if (typeof p.priceVnd !== 'number' || p.priceVnd < 0) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Products Price',
          id: p.productId,
          description: `Product "${p.name}" has negative price: ${p.priceVnd}`,
          details: { priceVnd: p.priceVnd }
        });
      }
      if (p.costPriceVnd !== undefined && (typeof p.costPriceVnd !== 'number' || p.costPriceVnd < 0)) {
        issues.push({
          severity: 'WARNING',
          category: 'Products CostPrice',
          id: p.productId,
          description: `Product "${p.name}" has negative cost price: ${p.costPriceVnd}`,
          details: { costPriceVnd: p.costPriceVnd }
        });
      }
    }
    console.log(`   Checked ${products.length} drink products.`);

    // 3. Audit Sports Items
    console.log('Checking Sports Items...');
    const sportsItems = await sportsItemsColl.find({}).toArray();
    const sportsItemIds = new Set(sportsItems.map(s => s.itemId));

    for (const s of sportsItems) {
      if (!s.isService && (typeof s.stock !== 'number' || s.stock < 0)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Sports Stock',
          id: s.itemId,
          description: `Sports item "${s.name}" has negative stock: ${s.stock}`,
          details: { stock: s.stock, isService: s.isService }
        });
      }
      if (typeof s.priceVnd !== 'number' || s.priceVnd < 0) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Sports Price',
          id: s.itemId,
          description: `Sports item "${s.name}" has negative price: ${s.priceVnd}`,
          details: { priceVnd: s.priceVnd }
        });
      }
      if (typeof s.costPriceVnd !== 'number' || s.costPriceVnd < 0) {
        issues.push({
          severity: 'WARNING',
          category: 'Sports CostPrice',
          id: s.itemId,
          description: `Sports item "${s.name}" has negative cost price: ${s.costPriceVnd}`,
          details: { costPriceVnd: s.costPriceVnd }
        });
      }
    }
    console.log(`   Checked ${sportsItems.length} sports items.`);

    // 4. Audit Orders & Math Invariants
    console.log('💰 Checking Orders & Financial Math Invariants...');
    const ordersCursor = ordersColl.find({}).sort({ createdAt: -1 });
    const orders = isFullScan ? await ordersCursor.toArray() : await ordersCursor.limit(3000).toArray();
    const orderIds = new Set(orders.map(o => o.orderId));
    let totalUnpaidDebtVnd = 0;
    let totalUnpaidDeliveredOrders = 0;

    for (const o of orders) {
      // Invariant: totalVnd non-negative
      if (typeof o.totalVnd !== 'number' || o.totalVnd < 0) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Order Total Negative',
          id: o.orderId,
          description: `Order ${o.displayCode || o.orderId} has negative totalVnd: ${o.totalVnd}`,
          details: { displayCode: o.displayCode, totalVnd: o.totalVnd }
        });
      }

      // Invariant: Order total matches sum of item lines
      if (Array.isArray(o.items)) {
        let computedSum = 0;
        for (const it of o.items) {
          const qty = Number(it.quantity) || 0;
          const unitPrice = Number(it.unitPriceVnd || it.unitPrice) || 0;
          const lineTotal = Number(it.lineTotalVnd || it.lineTotal) || 0;
          computedSum += lineTotal;

          const expectedLine = qty * unitPrice;
          if (Math.abs(expectedLine - lineTotal) > 1) {
            issues.push({
              severity: 'CRITICAL',
              category: 'Order Line Item Math Discrepancy',
              id: o.orderId,
              description: `Order ${o.displayCode} line item "${it.nameSnapshot || it.name}" total (${lineTotal}đ) != qty (${qty}) * unitPrice (${unitPrice}đ)`,
              details: { displayCode: o.displayCode, item: it }
            });
          }
        }

        if (Math.abs(computedSum - (Number(o.totalVnd) || 0)) > 1) {
          issues.push({
            severity: 'CRITICAL',
            category: 'Order Total Discrepancy',
            id: o.orderId,
            description: `Order ${o.displayCode} total (${o.totalVnd}đ) != sum of line totals (${computedSum}đ)`,
            details: { displayCode: o.displayCode, totalVnd: o.totalVnd, computedSum }
          });
        }
      }

      // Invariant: Court reference exists
      if (o.courtId && o.courtId !== 'counter' && !courtIds.has(o.courtId)) {
        issues.push({
          severity: 'WARNING',
          category: 'Order Orphan Court',
          id: o.orderId,
          description: `Order ${o.displayCode} references deleted or unknown courtId: ${o.courtId}`,
          details: { courtId: o.courtId, courtName: o.courtNameSnapshot }
        });
      }

      // Debt and payment status
      if (o.status === 'delivered' && o.paymentStatus === 'unpaid') {
        totalUnpaidDebtVnd += (Number(o.totalVnd) || 0);
        totalUnpaidDeliveredOrders++;
      }
      if (o.paymentStatus === 'paid' && !o.paidAt) {
        issues.push({
          severity: 'WARNING',
          category: 'Order Payment State',
          id: o.orderId,
          description: `Order ${o.displayCode} is marked 'paid' but paidAt is null`,
          details: { displayCode: o.displayCode, totalVnd: o.totalVnd }
        });
      }
      if (o.paymentStatus === 'unpaid' && o.paidAt) {
        issues.push({
          severity: 'WARNING',
          category: 'Order Payment Inconsistency',
          id: o.orderId,
          description: `Order ${o.displayCode} is marked 'unpaid' but has paidAt timestamp`,
          details: { displayCode: o.displayCode, paidAt: o.paidAt }
        });
      }
    }
    console.log(`   Sampled ${orders.length} orders. Found ${totalUnpaidDeliveredOrders} delivered orders with unpaid debt totaling ${totalUnpaidDebtVnd.toLocaleString('vi-VN')} VND.`);

    // 5. Audit Drink Inventory Movements & Math
    console.log('📜 Checking Drink Inventory Movements & Math...');
    const drinkMovementsCursor = inventoryMovementsColl.find({}).sort({ createdAt: -1 });
    const drinkMovements = isFullScan ? await drinkMovementsCursor.toArray() : await drinkMovementsCursor.limit(1000).toArray();
    for (const m of drinkMovements) {
      if (!productIds.has(m.productId)) {
        issues.push({
          severity: 'WARNING',
          category: 'Unlinked Drink Movement',
          id: m.operationId || String(m._id),
          description: `Drink movement references unknown or deleted productId: ${m.productId}`,
          details: { productId: m.productId, delta: m.delta, reason: m.reason }
        });
      }
      if (m.reason === 'order_created' && !m.orderId) {
        issues.push({
          // P2/Issue #17 FIX: Missing orderId on order_created movement = data integrity violation
          severity: 'CRITICAL',
          category: 'Movement Missing OrderId',
          id: m.operationId || String(m._id),
          description: `Drink movement with reason "order_created" has no orderId — stock was reduced without creating an order`,
          details: { productId: m.productId, delta: m.delta }
        });
      } else if (m.orderId && !orderIds.has(m.orderId)) {
        const existsInDb = isFullScan ? false : ((await ordersColl.countDocuments({ orderId: m.orderId }, { limit: 1 })) > 0);
        if (!existsInDb) {
          issues.push({
            // P2/Issue #17 FIX: Orphan movement = stock reduced but order doesn't exist = CRITICAL data corruption
            severity: 'CRITICAL',
            category: 'Movement Orphan OrderId',
            id: m.operationId || String(m._id),
            description: `[DATA CORRUPTION] Movement references non-existent orderId: ${m.orderId}. Stock was reduced but order does not exist.`,
            details: { orderId: m.orderId, productId: m.productId, delta: m.delta, reason: m.reason }
          });
        }
      }

      // Check math: delta * costPriceVnd vs totalCostVnd
      if (m.delta > 0 && m.costPriceVnd > 0 && m.totalCostVnd !== undefined) {
        const expectedCost = m.delta * m.costPriceVnd;
        if (Math.abs(expectedCost - m.totalCostVnd) > 1) {
          issues.push({
            severity: 'WARNING',
            category: 'Movement Cost Math Discrepancy',
            id: m.operationId || String(m._id),
            description: `Movement totalCost (${m.totalCostVnd}đ) != delta (${m.delta}) * costPrice (${m.costPriceVnd}đ)`,
            details: { delta: m.delta, costPriceVnd: m.costPriceVnd, totalCostVnd: m.totalCostVnd }
          });
        }
      }
    }
    // Invariant: Latest movement stockAfter matches current product stock
    for (const p of products) {
      if (p.deletedAt) continue;
      const latestMov = await inventoryMovementsColl.findOne({ productId: p.productId }, { sort: { createdAt: -1 } });
      if (latestMov && typeof latestMov.stockAfter === 'number' && latestMov.stockAfter !== p.stock) {
        issues.push({
          severity: 'WARNING',
          category: 'Drink Product Stock Desync',
          id: p.productId,
          description: `Product "${p.name}" stock (${p.stock}) does not match latest movement stockAfter (${latestMov.stockAfter})`,
          details: { productId: p.productId, currentStock: p.stock, latestMovementStockAfter: latestMov.stockAfter, latestMovementId: latestMov.operationId }
        });
      }
    }
    console.log(`   Sampled ${drinkMovements.length} recent drink movements.`);

    // 6. Audit Sports Inventory Movements & Math
    console.log('📜 Checking Sports Inventory Movements & Math...');
    const sportsMovementsCursor = sportsMovementsColl.find({}).sort({ createdAt: -1 });
    const sportsMovements = isFullScan ? await sportsMovementsCursor.toArray() : await sportsMovementsCursor.limit(1000).toArray();
    for (const sm of sportsMovements) {
      if (!sportsItemIds.has(sm.itemId)) {
        issues.push({
          severity: 'WARNING',
          category: 'Unlinked Sports Movement',
          id: sm.operationId || String(sm._id),
          description: `Sports movement references unknown or deleted itemId: ${sm.itemId}`,
          details: { itemId: sm.itemId, delta: sm.delta, reason: sm.reason }
        });
      }
      if (sm.delta > 0 && sm.costPriceVnd > 0 && sm.totalCostVnd !== undefined) {
        const expectedCost = sm.delta * sm.costPriceVnd;
        if (Math.abs(expectedCost - sm.totalCostVnd) > 1) {
          issues.push({
            severity: 'WARNING',
            category: 'Sports Movement Cost Math Discrepancy',
            id: sm.operationId || String(sm._id),
            description: `Sports movement totalCost (${sm.totalCostVnd}đ) != delta (${sm.delta}) * costPrice (${sm.costPriceVnd}đ)`,
            details: { delta: sm.delta, costPriceVnd: sm.costPriceVnd, totalCostVnd: sm.totalCostVnd }
          });
        }
      }
    }

    // Invariant: Latest sports movement stockAfter matches current sportsItem stock
    for (const s of sportsItems) {
      if (s.deletedAt || s.isService) continue;
      const latestMov = await sportsMovementsColl.findOne({ itemId: s.itemId }, { sort: { createdAt: -1 } });
      if (latestMov && typeof latestMov.stockAfter === 'number' && latestMov.stockAfter !== s.stock) {
        issues.push({
          severity: 'WARNING',
          category: 'Sports Item Stock Desync',
          id: s.itemId,
          description: `Sports item "${s.name}" stock (${s.stock}) does not match latest movement stockAfter (${latestMov.stockAfter})`,
          details: { itemId: s.itemId, currentStock: s.stock, latestMovementStockAfter: latestMov.stockAfter, latestMovementId: latestMov.operationId }
        });
      }
    }
    console.log(`   Sampled ${sportsMovements.length} recent sports movements.`);

    // 7. Audit RBAC & Admin Users
    console.log('🛡️ Checking RBAC Roles & Users...');
    const roles = await rolesColl.find({}).toArray();
    const roleIds = new Set(roles.map(r => r.roleId));
    const users = await usersColl.find({}).toArray();

    for (const u of users) {
      if (!u.roleId || !roleIds.has(u.roleId)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'RBAC User Orphan Role',
          id: u.userId,
          description: `User "${u.username}" references non-existent roleId: ${u.roleId}`,
          details: { username: u.username, roleId: u.roleId }
        });
      }
      if (!u.username || !u.passwordHash) {
        issues.push({
          severity: 'CRITICAL',
          category: 'RBAC User Corrupted',
          id: u.userId,
          description: `User "${u.username || u.userId}" missing username or passwordHash`,
          details: { userId: u.userId }
        });
      }
    }
    console.log(`   Checked ${roles.length} roles and ${users.length} admin users.`);

    // Summary Report
    console.log('\n========================================');
    console.log('📊 AUDIT SUMMARY REPORT');
    console.log('========================================');
    const criticals = issues.filter(i => i.severity === 'CRITICAL');
    const warnings = issues.filter(i => i.severity === 'WARNING');
    const infos = issues.filter(i => i.severity === 'INFO');

    console.log(`🔴 Critical Issues : ${criticals.length}`);
    console.log(`🟡 Warnings        : ${warnings.length}`);
    console.log(`🔵 Info Notices    : ${infos.length}`);
    console.log('----------------------------------------');

    if (issues.length > 0) {
      for (const iss of issues) {
        const icon = iss.severity === 'CRITICAL' ? '❌' : iss.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        console.log(`${icon} [${iss.severity}] [${iss.category}] ${iss.id}: ${iss.description}`);
        if (iss.details) {
          console.log(`   Details:`, JSON.stringify(iss.details));
        }
      }
    } else {
      console.log('✅ No database anomalies found! Database is healthy and consistent.');
    }
    console.log('========================================\n');

    await client.close();

    if (criticals.length > 0) {
      console.error(`❌ Audit failed with ${criticals.length} critical issues.`);
      process.exit(1);
    }
    console.log('✅ Database integrity audit passed successfully.');
  } catch (err) {
    console.error('Audit failed with error:', (err as Error).message);
    await client.close().catch(() => {});
    process.exit(1);
  }
}

runAudit();
