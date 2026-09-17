import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { Redis } from 'ioredis';
import { existsSync } from 'node:fs';
import path from 'node:path';

async function verify() {
  console.log('🔍 ĐANG KIỂM TRA MỨC ĐỘ SẴN SÀNG PRODUCTION (PRE-FLIGHT CHECK)...');
  console.log('===================================================================');
  let passed = true;

  // 1. Kiểm tra biến môi trường NODE_ENV (BẮT BUỘC PHẢI LÀ PRODUCTION)
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    console.log('  ✅ [Môi Trường] NODE_ENV=production được cấu hình chính xác.');
  } else {
    console.error(`  ❌ [Môi Trường] NODE_ENV="${nodeEnv || 'undefined'}". Khi chạy kiểm tra sẵn sàng production, NODE_ENV BẮT BUỘC phải là "production".`);
    passed = false;
  }

  // 2. Kiểm tra build frontend
  const distIndex = path.resolve('dist/index.html');
  if (existsSync(distIndex)) {
    console.log('  ✅ [Frontend Build] Đã build thư mục dist/ thành công.');
  } else {
    console.error('  ❌ [Frontend Build] Chưa tìm thấy dist/index.html. Hãy chạy `npm run build`.');
    passed = false;
  }

  // 3. Kiểm tra PUBLIC_ORIGIN và HTTPS
  const publicOrigin = (process.env.PUBLIC_ORIGIN || '').trim();
  if (!publicOrigin) {
    console.error('  ❌ [Tên Miền] PUBLIC_ORIGIN chưa được cấu hình. Cần gán domain production (ví dụ: https://order.tranluubadminton.vn).');
    passed = false;
  } else if (!publicOrigin.startsWith('https://') && !publicOrigin.startsWith('http://localhost')) {
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
  if (cookieSecret && cookieSecret.length >= 32 && !cookieSecret.includes('dev_cookie_secret') && !cookieSecret.includes('change_in_prod')) {
    console.log(`  ✅ [Bảo Mật Phiên] COOKIE_SECRET an toàn (độ dài: ${cookieSecret.length} ký tự).`);
  } else {
    console.error('  ❌ [Bảo Mật Phiên] COOKIE_SECRET chưa được cấu hình riêng, dùng giá trị mặc định hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 5. Kiểm tra QR_SIGN_SECRET
  const qrSecret = (process.env.QR_SIGN_SECRET || '').trim();
  if (qrSecret && qrSecret.length >= 32 && qrSecret !== 'tran-luu-court-qr-hmac-secret-v2') {
    console.log(`  ✅ [Bảo Mật QR Sân] QR_SIGN_SECRET an toàn (độ dài: ${qrSecret.length} ký tự).`);
  } else {
    console.error('  ❌ [Bảo Mật QR Sân] QR_SIGN_SECRET chưa được cấu hình riêng hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 6. Kiểm tra Mật khẩu Admin
  const passHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (passHash && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passHash)) {
    console.log('  ✅ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH chuẩn định dạng scrypt 32-salt : 128-hash.');
  } else {
    console.error('  ❌ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH không đúng định dạng salt:scrypt. Hãy chạy `npm run admin:hash` để sinh.');
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
      console.error('  ❌ [MongoDB] Production BẮT BUỘC Replica Set để đảm bảo giao dịch ACID và Snapshot Isolation.');
      console.error('     Tuyệt đối không sử dụng MongoDB Standalone trong môi trường production!');
      console.error('     Hướng dẫn: Khởi chạy MongoDB với cờ `--replSet rs0` hoặc chạy `npm run mongo:replica`.');
      passed = false;
    }
    await client.close();
  } catch (err: any) {
    console.error('  ❌ [MongoDB] Không thể kết nối tới cơ sở dữ liệu:', err.message);
    passed = false;
  }

  // 8. Kiểm tra kết nối Redis (nếu Redis được bật)
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('  ℹ️ [Redis] Đang tắt via REDIS_ENABLED=false (Chạy chế độ đơn lẻ Single-Instance in-memory fallback).');
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
        console.log(`  ✅ [Redis] Đã kết nối và phản hồi PONG thành công (${redisUrl || `${redisHost}:${redisPort}`}). Hỗ trợ đầy đủ cụm backend đa instance.`);
      }
    } catch (err: any) {
      console.error(`  ❌ [Redis] Không thể kết nối tới Redis server (${err.message}).`);
      console.error('     Nếu chạy multi-backend clustering, Redis là bắt buộc để đồng bộ realtime & thu hồi session.');
      console.error('     Nếu chỉ chạy 1 backend instance duy nhất, hãy đặt REDIS_ENABLED=false trong file .env.');
      passed = false;
    } finally {
      if (redisClient) {
        try { await redisClient.quit(); } catch { /* ignore */ }
      }
    }
  }

  console.log('-------------------------------------------------------------------');
  if (passed) {
    console.log('🎉 TẤT CẢ TIÊU CHÍ ĐÃ ĐẠT CHUẨN SẴN SÀNG TRIỂN KHAI PRODUCTION!');
    process.exit(0);
  } else {
    console.error('❌ CÓ LỖI HOẶC THIẾU CẤU HÌNH QUAN TRỌNG TRƯỚC KHI CHẠY PRODUCTION!');
    process.exit(1);
  }
}

void verify();
