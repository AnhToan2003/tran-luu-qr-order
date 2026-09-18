import { MongoClient } from 'mongodb';
import { Redis } from 'ioredis';
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// 1. Lưu snapshot biến môi trường hệ thống ban đầu
const initialEnv = { ...process.env };

// 2. Nạp .env.production trước để lấy cấu hình production chuẩn
const prodEnv = path.resolve('.env.production');
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
  console.log(`🔍 ĐANG KIỂM TRA MỨC ĐỘ SẴN SÀNG PRODUCTION (${isStrict ? 'STRICT PRODUCTION MODE' : 'LOCAL STAGING CHECK'})...`);
  console.log('===================================================================');
  let passed = true;
  let hasStagingWarnings = false;

  // 1. Kiểm tra biến môi trường NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'production';
  if (nodeEnv === 'production') {
    console.log('  ✅ [Môi Trường] NODE_ENV=production được cấu hình chính xác.');
  } else {
    if (isStrict) {
      console.error(`  ❌ [Môi Trường] Ở chế độ Strict Production, NODE_ENV ("${nodeEnv}") bắt buộc phải là "production".`);
      passed = false;
    } else {
      console.log(`  ⚠️ [Môi Trường] NODE_ENV="${nodeEnv}". Chưa đặt "production".`);
      hasStagingWarnings = true;
    }
  }

  // 2. Kiểm tra build frontend & backend
  const distIndex = path.resolve('dist/index.html');
  const distServer = path.resolve('dist-server/index.js');
  if (existsSync(distIndex) && existsSync(distServer)) {
    console.log('  ✅ [Production Build] Đã build thành công dist/ (Frontend) và dist-server/ (Backend).');
  } else {
    if (!existsSync(distIndex)) console.error('  ❌ [Frontend Build] Chưa tìm thấy dist/index.html. Hãy chạy `npm run build`.');
    if (!existsSync(distServer)) console.error('  ❌ [Backend Build] Chưa tìm thấy dist-server/index.js. Hãy chạy `npm run build`.');
    passed = false;
  }

  // 3. Kiểm tra PUBLIC_ORIGIN
  const publicOrigin = (process.env.PUBLIC_ORIGIN || '').trim();
  if (!publicOrigin) {
    console.error('  ❌ [Tên Miền] PUBLIC_ORIGIN chưa được cấu hình. Cần gán domain production (ví dụ: https://order.tranluubadminton.vn).');
    passed = false;
  } else if (publicOrigin.startsWith('http://localhost') || publicOrigin.startsWith('http://127.0.0.1')) {
    if (isStrict) {
      console.error(`  ❌ [Bảo Mật HTTPS] Ở chế độ Strict Production, PUBLIC_ORIGIN ("${publicOrigin}") không được dùng localhost. Bắt buộc domain HTTPS thực tế.`);
      passed = false;
    } else {
      console.log(`  ⚠️ [Bảo Mật HTTPS & Domain] Đang sử dụng localhost ("${publicOrigin}"). Chỉ hợp lệ cho thử nghiệm nội bộ, CHƯA ĐẠT CHUẨN DEPLOY THỰC TẾ.`);
      hasStagingWarnings = true;
    }
  } else if (!publicOrigin.startsWith('https://')) {
    console.error(`  ❌ [Bảo Mật HTTPS] PUBLIC_ORIGIN ("${publicOrigin}") bắt buộc phải sử dụng giao thức an toàn https:// trong môi trường production.`);
    passed = false;
  } else if (publicOrigin.endsWith('/')) {
    console.error(`  ❌ [Tên Miền] PUBLIC_ORIGIN ("${publicOrigin}") không được chứa dấu gạch chéo kết thúc (trailing slash).`);
    passed = false;
  } else {
    console.log(`  ✅ [Bảo Mật HTTPS & Domain] PUBLIC_ORIGIN an toàn: ${publicOrigin}`);
  }

  // 4. Kiểm tra COOKIE_SECRET
  const cookieSecret = (process.env.COOKIE_SECRET || '').trim();
  if (cookieSecret && cookieSecret.length >= 32 && !cookieSecret.includes('dev_cookie_secret') && !cookieSecret.includes('change_in_prod') && cookieSecret !== '3a7b9c1d5e0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2e') {
    console.log(`  ✅ [Bảo Mật Phiên] COOKIE_SECRET an toàn (độ dài: ${cookieSecret.length} ký tự).`);
  } else {
    console.error('  ❌ [Bảo Mật Phiên] COOKIE_SECRET chưa được cấu hình, bị trùng khóa mẫu đã lộ hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 5. Kiểm tra QR_SIGN_SECRET
  const qrSecret = (process.env.QR_SIGN_SECRET || '').trim();
  if (qrSecret && qrSecret.length >= 32 && qrSecret !== 'tran-luu-court-qr-hmac-secret-v2' && qrSecret !== '8f4e2d7c9a1b0e3f5a7c2b4d6e8f0a1c3e5b7d9f1a2c4e6b8d0f2a4c6e8b0d2a') {
    console.log(`  ✅ [Bảo Mật QR Sân] QR_SIGN_SECRET an toàn (độ dài: ${qrSecret.length} ký tự).`);
  } else {
    console.error('  ❌ [Bảo Mật QR Sân] QR_SIGN_SECRET chưa được cấu hình, bị trùng khóa mẫu đã lộ hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 6. Kiểm tra Mật khẩu Admin
  const passHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (passHash && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passHash)) {
    console.log('  ✅ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH chuẩn định dạng scrypt 32-salt : 128-hash.');
  } else {
    console.error('  ❌ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH không đúng định dạng salt:scrypt.');
    passed = false;
  }

  // 7. Kiểm tra kết nối MongoDB & BẮT BUỘC Replica Set
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    const isReplica = Boolean(hello.setName || hello.msg === 'isdbgrid');
    if (isReplica) {
      console.log(`  ✅ [MongoDB] Đang chạy chế độ Replica Set (${hello.setName || 'Mongos Grid'}). Đảm bảo tuyệt đối MongoDB ACID Transactions & Snapshot Read.`);
    } else {
      if (isStrict) {
        console.error('  ❌ [MongoDB ACID] Chế độ Strict Production BẮT BUỘC MongoDB Replica Set để đảm bảo toàn vẹn dữ liệu.');
        passed = false;
      } else if (process.env.ALLOW_STANDALONE === 'true') {
        console.log('  ⚠️ [MongoDB] Đang chạy Standalone MongoDB với ALLOW_STANDALONE=true. Chỉ hợp lệ cho kiểm thử nội bộ, KHÔNG CÓ ACID TRANSACTIONS.');
        hasStagingWarnings = true;
      } else {
        console.error('  ❌ [MongoDB] Production bắt buộc Replica Set để đảm bảo giao dịch ACID và Snapshot Isolation.');
        passed = false;
      }
    }
    await client.close();
  } catch (err: any) {
    console.error('  ❌ [MongoDB] Không thể kết nối tới cơ sở dữ liệu:', err.message);
    passed = false;
  }

  // 8. Kiểm tra kết nối Redis
  if (process.env.REDIS_ENABLED === 'false') {
    if (isStrict) {
      console.error('  ❌ [Redis] Chế độ Strict Production yêu cầu REDIS_ENABLED=true để đồng bộ cụm backend và thu hồi session.');
      passed = false;
    } else {
      console.log('  ⚠️ [Redis] Đang tắt via REDIS_ENABLED=false (Chạy chế độ đơn lẻ Single-Instance in-memory fallback).');
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
    try {
      redisClient = new Redis(redisOpts as any);
      await redisClient.connect();
      const ping = await redisClient.ping();
      if (ping === 'PONG') {
        console.log(`  ✅ [Redis] Đã kết nối và phản hồi PONG thành công (${redisUrl || `${redisHost}:${redisPort}`}).`);
      }
    } catch (err: any) {
      console.error(`  ❌ [Redis] Không thể kết nối tới Redis server (${err.message}).`);
      passed = false;
    } finally {
      if (redisClient) {
        try { await redisClient.quit(); } catch { /* ignore */ }
      }
    }
  }

  console.log('-------------------------------------------------------------------');
  if (!passed) {
    console.error('❌ CÓ LỖI HOẶC THIẾU CẤU HÌNH QUAN TRỌNG TRƯỚC KHI CHẠY PRODUCTION!');
    process.exit(1);
  } else if (hasStagingWarnings) {
    console.log('⚠️ KIỂM THỬ NỘI BỘ THÀNH CÔNG (LOCAL STAGING MODE).');
    console.log('   LƯU Ý: Vẫn còn các cảnh báo (localhost / Standalone Mongo / Redis tắt).');
    console.log('   Hãy chạy `npm run check:prod:strict` để kiểm tra chuẩn deploy thực tế.');
    process.exit(0);
  } else {
    console.log('🎉 TẤT CẢ TIÊU CHÍ ĐÃ ĐẠT CHUẨN SẴN SÀNG TRIỂN KHAI PRODUCTION!');
    process.exit(0);
  }
}

void verify();
