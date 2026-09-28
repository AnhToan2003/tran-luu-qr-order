import { MongoClient } from 'mongodb';
import { Redis } from 'ioredis';
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { maskUriCredentials } from '../server/utils/maskUri.js';

// 1. Lưu snapshot biến môi trường hệ thống ban đầu
const initialEnv = { ...process.env };

// 2. Nạp file môi trường được chỉ định; mặc định là production.
const envFileArg = process.argv.find(arg => arg.startsWith('--env-file='))?.slice('--env-file='.length);
const prodEnv = path.resolve(envFileArg || process.env.ENV_FILE || '.env.production');
if (existsSync(prodEnv)) {
  dotenv.config({ path: prodEnv });
}
// Nạp thêm .env nếu còn biến nào thiếu
dotenv.config();

// 3. Khôi phục lại biến môi trường của host để biến hệ thống luôn ưu tiên cao nhất
for (const [key, val] of Object.entries(initialEnv)) {
  if (val !== undefined) {
    process.env[key] = val;
  }
}

async function verify() {
  const isStrict = process.argv.includes('--strict') || process.env.STRICT_PROD === 'true';
  const deployEnvironment = process.env.APP_ENV || 'production';
  console.log(`[CHECK] ĐANG KIỂM TRA MỨC ĐỘ SẴN SÀNG ${deployEnvironment.toUpperCase()} (${isStrict ? 'STRICT MODE' : 'LOCAL CHECK'})...`);
  console.log('===================================================================');
  let passed = true;
  let hasStagingWarnings = false;
  const isStrongSecret = (value: string, placeholders: string[] = []) =>
    value.length >= 32 && !placeholders.some(item => value.toLowerCase().includes(item.toLowerCase()));

  // 1. Kiểm tra biến môi trường NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'production';
  if (nodeEnv === 'production') {
    console.log('  [OK] [Môi Trường] NODE_ENV=production được cấu hình chính xác.');
  } else {
    if (isStrict) {
      console.error(`  [FAIL] [Môi Trường] Ở chế độ Strict Production, NODE_ENV ("${nodeEnv}") bắt buộc phải là "production".`);
      passed = false;
    } else {
      console.log(`  [WARN] [Môi Trường] NODE_ENV="${nodeEnv}". Chưa đặt "production".`);
      hasStagingWarnings = true;
    }
  }

  // 2. Kiểm tra build frontend & backend
  const distIndex = path.resolve('dist/index.html');
  const distServer = path.resolve('dist-server/index.js');
  if (existsSync(distIndex) && existsSync(distServer)) {
    console.log('  [OK] [Production Build] Đã build thành công dist/ (Frontend) và dist-server/ (Backend).');
  } else {
    if (!existsSync(distIndex)) console.error('  [FAIL] [Frontend Build] Chưa tìm thấy dist/index.html. Hãy chạy `npm run build`.');
    if (!existsSync(distServer)) console.error('  [FAIL] [Backend Build] Chưa tìm thấy dist-server/index.js. Hãy chạy `npm run build`.');
    passed = false;
  }

  // 3. Kiểm tra PUBLIC_ORIGIN
  const publicOrigin = (process.env.PUBLIC_ORIGIN || '').trim();
  if (!publicOrigin) {
    console.error('  [FAIL] [Tên Miền] PUBLIC_ORIGIN chưa được cấu hình. Cần gán domain production (ví dụ: https://order.tranluubadminton.vn).');
    passed = false;
  } else if (publicOrigin.startsWith('http://localhost') || publicOrigin.startsWith('http://127.0.0.1')) {
    if (isStrict) {
      console.error(`  [FAIL] [Bảo Mật HTTPS] Ở chế độ Strict Production, PUBLIC_ORIGIN ("${publicOrigin}") không được dùng localhost. Bắt buộc domain HTTPS thực tế.`);
      passed = false;
    } else {
      console.log(`  [WARN] [Bảo Mật HTTPS & Domain] Đang sử dụng localhost ("${publicOrigin}"). Chỉ hợp lệ cho thử nghiệm nội bộ, CHƯA ĐẠT CHUẨN DEPLOY THỰC TẾ.`);
      hasStagingWarnings = true;
    }
  } else if (!publicOrigin.startsWith('https://')) {
    console.error(`  [FAIL] [Bảo Mật HTTPS] PUBLIC_ORIGIN ("${publicOrigin}") bắt buộc phải sử dụng giao thức an toàn https:// trong môi trường production.`);
    passed = false;
  } else if (publicOrigin.endsWith('/')) {
    console.error(`  [FAIL] [Tên Miền] PUBLIC_ORIGIN ("${publicOrigin}") không được chứa dấu gạch chéo kết thúc (trailing slash).`);
    passed = false;
  } else if (/change-me|example\.com/i.test(publicOrigin)) {
    console.error(`  [FAIL] [Tên Miền] PUBLIC_ORIGIN ("${publicOrigin}") vẫn là giá trị mẫu; hãy cấu hình domain thật.`);
    passed = false;
  } else {
    console.log(`  [OK] [Bảo Mật HTTPS & Domain] PUBLIC_ORIGIN an toàn: ${publicOrigin}`);
  }

  // 4. Kiểm tra COOKIE_SECRET
  const cookieSecret = (process.env.COOKIE_SECRET || '').trim();
  if (isStrongSecret(cookieSecret, ['dev_cookie_secret', 'change_in_prod', 'change_me', 'replace-with']) && cookieSecret !== '3a7b9c1d5e0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2e') {
    console.log(`  [OK] [Bảo Mật Phiên] COOKIE_SECRET an toàn (độ dài: ${cookieSecret.length} ký tự).`);
  } else {
    console.error('  [FAIL] [Bảo Mật Phiên] COOKIE_SECRET chưa được cấu hình, bị trùng khóa mẫu đã lộ hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 5. Kiểm tra QR_SIGN_SECRET
  const qrSecret = (process.env.QR_SIGN_SECRET || '').trim();
  if (isStrongSecret(qrSecret, ['change_me', 'replace-with']) && qrSecret !== 'tran-luu-court-qr-hmac-secret-v2' && qrSecret !== '8f4e2d7c9a1b0e3f5a7c2b4d6e8f0a1c3e5b7d9f1a2c4e6b8d0f2a4c6e8b0d2a') {
    console.log(`  [OK] [Bảo Mật QR Sân] QR_SIGN_SECRET an toàn (độ dài: ${qrSecret.length} ký tự).`);
  } else {
    console.error('  [FAIL] [Bảo Mật QR Sân] QR_SIGN_SECRET chưa được cấu hình, bị trùng khóa mẫu đã lộ hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }
  if (process.env.QR_ALLOW_LEGACY_TAGS === 'true') {
    const message = 'QR_ALLOW_LEGACY_TAGS=true đang cho phép chữ ký QR legacy 48-bit; chỉ bật tạm thời trong thời gian thay mã QR cũ.';
    if (isStrict) {
      console.error(`  [FAIL] [Bảo Mật QR Sân] ${message}`);
      passed = false;
    } else {
      console.log(`  [WARN] [Bảo Mật QR Sân] ${message}`);
      hasStagingWarnings = true;
    }
  }

  // 5b. Operational secrets used by backups and protected readiness probes.
  const backupKey = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (isStrongSecret(backupKey, ['change_me', 'replace-with', 'example'])) {
    console.log(`  [OK] [Backup] BACKUP_ENCRYPTION_KEY đã cấu hình an toàn (độ dài: ${backupKey.length} ký tự).`);
  } else {
    console.error('  [FAIL] [Backup] BACKUP_ENCRYPTION_KEY bắt buộc, không được là placeholder và phải dài ít nhất 32 ký tự.');
    passed = false;
  }

  const offsiteTarget = (process.env.BACKUP_OFFSITE_HOST_PATH || process.env.BACKUP_OFFSITE_DIR || '').trim();
  if (offsiteTarget) {
    console.log('  [OK] [Backup Off-site] Đã cấu hình đích lưu độc lập cho bản sao mã hóa.');
  } else if (isStrict) {
    console.error('  [FAIL] [Backup Off-site] Strict production yêu cầu BACKUP_OFFSITE_HOST_PATH hoặc BACKUP_OFFSITE_DIR.');
    passed = false;
  } else {
    console.log('  [WARN] [Backup Off-site] Chưa cấu hình đích lưu độc lập; mất host có thể làm mất cả DB và backup local.');
    hasStagingWarnings = true;
  }

  const minPool = Number.parseInt(process.env.MONGO_MIN_POOL_SIZE || '2', 10);
  const maxPool = Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10);
  if (!Number.isFinite(minPool) || !Number.isFinite(maxPool) || minPool < 0 || maxPool < 5 || minPool > maxPool || maxPool > 500) {
    console.error('  [FAIL] [MongoDB Pool] MONGO_MIN_POOL_SIZE/MAX_POOL_SIZE không hợp lệ hoặc vượt giới hạn an toàn.');
    passed = false;
  } else {
    console.log(`  [OK] [MongoDB Pool] Cấu hình ${minPool}-${maxPool} kết nối cho mỗi instance.`);
  }

  const healthToken = (process.env.INTERNAL_HEALTH_TOKEN || process.env.HEALTH_CHECK_TOKEN || '').trim();
  if (isStrongSecret(healthToken, ['change_me', 'replace-with', 'example'])) {
    console.log(`  [OK] [Readiness] INTERNAL_HEALTH_TOKEN đã cấu hình an toàn (độ dài: ${healthToken.length} ký tự).`);
  } else {
    console.error('  [FAIL] [Readiness] INTERNAL_HEALTH_TOKEN bắt buộc, không được là placeholder và phải dài ít nhất 32 ký tự.');
    passed = false;
  }

  // 6. Kiểm tra Mật khẩu Admin
  const passHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (passHash && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passHash)) {
    console.log('  [OK] [Mật Khẩu Admin] ADMIN_PASSWORD_HASH chuẩn định dạng scrypt 32-salt : 128-hash.');
  } else {
    console.error('  [FAIL] [Mật Khẩu Admin] ADMIN_PASSWORD_HASH không đúng định dạng salt:scrypt.');
    passed = false;
  }

  // 7. Kiểm tra kết nối MongoDB & BẮT BUỘC Replica Set
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI;

  if (!uri) {
    console.error('  [FAIL] [MongoDB] MONGO_URI chưa được cấu hình.');
    passed = false;
  } else {
    let targetUri = uri;
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(targetUri, { serverSelectionTimeoutMS: 3000 });
      try {
        await client.connect();
      } catch (connErr: any) {
        if (!isStrict && targetUri.includes('://mongodb:') && (connErr.message?.includes('ENOTFOUND') || connErr.message?.includes('timed out') || connErr.name === 'MongoServerSelectionError')) {
          console.log('  [INFO] [MongoDB Docker DNS] Hostname "mongodb" là service nội bộ Docker.');
          console.log('  [WARN] Đang kiểm tra dịch vụ local 127.0.0.1 thay thế; kết quả này không xác minh MongoDB production thực tế.');
          hasStagingWarnings = true;
          targetUri = targetUri.replace('://mongodb:', '://127.0.0.1:').replace('replicaSet=rs0', '');
          client = new MongoClient(targetUri, { serverSelectionTimeoutMS: 3000 });
          await client.connect();
        } else {
          throw connErr;
        }
      }

      const hello = await client.db('admin').command({ hello: 1 });
      const isReplica = Boolean(hello.setName || hello.msg === 'isdbgrid');
      if (isReplica) {
        console.log(`  [OK] [MongoDB] Đã kết nối đúng đích và xác minh Replica Set (${hello.setName || 'Mongos Grid'}).`);
      } else {
        if (isStrict) {
          console.error('  [FAIL] [MongoDB ACID] Chế độ Strict Production BẮT BUỘC MongoDB Replica Set để đảm bảo toàn vẹn dữ liệu.');
          passed = false;
        } else {
          console.log('  [WARN] [MongoDB] Đích kiểm tra đang chạy Standalone MongoDB. Chỉ hợp lệ cho kiểm thử nội bộ, KHÔNG CÓ ACID TRANSACTIONS.');
          hasStagingWarnings = true;
        }
      }

      // P1/Issue #8 FIX: ALLOW_STANDALONE must NOT be set in strict production
      if (isStrict && process.env.ALLOW_STANDALONE === 'true') {
        console.error('  [FAIL] [Bảo Mật] ALLOW_STANDALONE=true không được phép trong Strict Production Mode.');
        console.error('     Điều này cho phép giao dịch không atomic — có thể gây mất dữ liệu.');
        passed = false;
      }
    } catch (err: any) {
      console.error('  [FAIL] [MongoDB] Không thể kết nối và xác minh đúng cơ sở dữ liệu:', maskUriCredentials(err.message));
      passed = false;
    } finally {
      if (client) {
        try { await client.close(); } catch { /* ignore */ }
      }
    }
  }

  // 8. Kiểm tra kết nối Redis
  if (process.env.REDIS_ENABLED === 'false') {
    if (isStrict) {
      console.error('  [FAIL] [Redis] Chế độ Strict Production yêu cầu REDIS_ENABLED=true để đồng bộ cụm backend và thu hồi session.');
      passed = false;
    } else {
      console.log('  [WARN] [Redis] Đang tắt via REDIS_ENABLED=false (Chạy chế độ đơn lẻ Single-Instance in-memory fallback).');
      hasStagingWarnings = true;
    }
  } else {
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;
    const redisUrl = process.env.REDIS_URL;

    const redisOpts = redisUrl || {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      lazyConnect: true
    };

    let redisClient: Redis | null = null;
    let targetOpts: any = redisOpts;
    try {
      try {
        redisClient = typeof targetOpts === 'string'
          ? new Redis(targetOpts, { password: redisPassword, lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 0 })
          : new Redis(targetOpts);
        redisClient.on('error', () => { /* Suppress unhandled error log during fallback check */ });
        await redisClient.connect();
      } catch (connErr: any) {
        if (!isStrict && typeof targetOpts === 'string' && targetOpts.includes('://redis:')) {
          console.log('  [INFO] [Redis Docker DNS] Hostname "redis" là service nội bộ Docker.');
          console.log('  [WARN] Đang kiểm tra Redis local 127.0.0.1 thay thế; kết quả này không xác minh Redis production thực tế.');
          hasStagingWarnings = true;
          targetOpts = targetOpts.replace('://redis:', '://127.0.0.1:');
          if (redisClient) {
            try { redisClient.disconnect(); } catch {}
          }
          redisClient = new Redis(targetOpts, { password: redisPassword, lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 0 });
          redisClient.on('error', () => { /* Suppress unhandled error log */ });
          await redisClient.connect();
        } else {
          throw connErr;
        }
      }

      const ping = await redisClient.ping();
      if (ping === 'PONG') {
        const masked = typeof targetOpts === 'string' ? maskUriCredentials(targetOpts) : `${redisHost}:${redisPort}`;
        console.log(`  [OK] [Redis] Đã kết nối và phản hồi PONG thành công (${masked}).`);
      }
    } catch (err: any) {
      console.error(`  [FAIL] [Redis] Không thể kết nối và xác minh Redis server (${maskUriCredentials(err.message)}).`);
      passed = false;
    } finally {
      if (redisClient) {
        try { await redisClient.quit(); } catch { /* ignore */ }
      }
    }
  }

  // 9. Kiểm tra Docker Keyfile cho Production Replica Set
  const keyfilePath = path.resolve('docker/secrets/mongo-keyfile');
  if (existsSync(keyfilePath)) {
    console.log('  [OK] [Docker Secrets] Đã tìm thấy docker/secrets/mongo-keyfile.');
  } else {
    console.log('  [WARN] [Docker Secrets] Chưa có docker/secrets/mongo-keyfile (cần thiết khi chạy Docker Compose với Replica Set có xác thực).');
    if (isStrict) passed = false;
  }

  console.log('-------------------------------------------------------------------');
  if (!passed) {
    console.error('[FAIL] CÓ LỖI HOẶC THIẾU CẤU HÌNH QUAN TRỌNG TRƯỚC KHI CHẠY PRODUCTION!');
    process.exit(1);
  } else if (hasStagingWarnings) {
    console.log('[WARN] KIỂM THỬ NỘI BỘ THÀNH CÔNG (LOCAL STAGING MODE).');
    console.log('   LƯU Ý: Một hoặc nhiều phụ thuộc đang là local fallback, standalone hoặc chưa phải đúng đích deploy.');
    console.log('   Hãy chạy `npm run check:prod:strict` bên trong đúng môi trường deploy để xác minh production thực tế.');
    process.exit(0);
  } else {
    console.log(`[SUCCESS] ${isStrict ? 'ĐÃ XÁC MINH TRỰC TIẾP CÁC TIÊU CHÍ PRODUCTION.' : 'KIỂM TRA LOCAL/STAGING ĐÃ ĐẠT; dùng --strict trong đúng môi trường deploy để xác minh production thực tế.'}`);
    process.exit(0);
  }
}

void verify();
