// Cross-platform production starter for Tran Luu Badminton & Drinks System
// P1/Issue #8 FIX: Runs strict production verification BEFORE starting the server.
// The server will NOT start if any critical check fails.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

// 1. Save snapshot of host environment variables (Docker/Cloud inject)
const hostEnv = { ...process.env };

// 2. Load .env.production if present (do not override host vars)
const prodEnvPath = path.resolve('.env.production');
if (existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: false });
} else {
  dotenv.config({ override: false });
}

// 3. Restore host env variables to ensure Cloud/Server vars take absolute priority
for (const [key, value] of Object.entries(hostEnv)) {
  if (value !== undefined) {
    process.env[key] = value;
  }
}

// Force production mode
process.env.NODE_ENV = 'production';

console.log('🔍 Kiểm tra cấu hình production trước khi khởi động...');
console.log(`- Cổng dịch vụ (PORT): ${process.env.PORT || 3001}`);
console.log(`- Cơ sở dữ liệu (DB_NAME): ${process.env.DB_NAME || 'tran_luu_qr_order'}`);
console.log(`- Nguồn gốc cho phép (PUBLIC_ORIGIN): ${process.env.PUBLIC_ORIGIN || 'Tự động theo Host'}`);

// P1/Issue #8 FIX: ALWAYS run strict production check before starting
// This prevents the server from starting with dangerous misconfigurations
// such as localhost PUBLIC_ORIGIN, standalone MongoDB, or weak secrets.
try {
  execSync('node --experimental-specifier-resolution=node -e "import(\'tsx/esm\').then(() => import(\'./scripts/verify-production.ts\'))"', {
    stdio: 'inherit',
    env: { ...process.env, STRICT_PROD: 'true' }
  });
} catch {
  // verify-production.ts calls process.exit(1) on failure — this catch handles it
  console.error('\n❌ PRODUCTION VERIFICATION FAILED — Server startup aborted.');
  console.error('   Fix all errors above before starting the server in production mode.');
  process.exit(1);
}

console.log('✅ Production checks passed. Starting server...\n');
await import('../dist-server/index.js');
