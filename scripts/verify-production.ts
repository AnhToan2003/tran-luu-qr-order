import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { existsSync } from 'node:fs';
import path from 'node:path';

async function verify() {
  console.log('🔍 ĐANG KIỂM TRA MỨC ĐỘ SẴN SÀNG PRODUCTION (PRE-FLIGHT CHECK)...');
  let passed = true;

  // 1. Kiểm tra build frontend
  const distIndex = path.resolve('dist/index.html');
  if (existsSync(distIndex)) {
    console.log('  ✅ [Frontend Build] Đã build thư mục dist/ thành công.');
  } else {
    console.warn('  ⚠️ [Frontend Build] Chưa tìm thấy dist/index.html. Hãy chạy `npm run build`.');
    passed = false;
  }

  // 2. Kiểm tra QR_SIGN_SECRET
  const qrSecret = process.env.QR_SIGN_SECRET || '';
  if (qrSecret && qrSecret.length >= 32 && qrSecret !== 'tran-luu-court-qr-hmac-secret-v2') {
    console.log(`  ✅ [Bảo Mật QR] QR_SIGN_SECRET an toàn (độ dài: ${qrSecret.length} ký tự).`);
  } else {
    console.warn('  ⚠️ [Bảo Mật QR] QR_SIGN_SECRET chưa được cấu hình riêng hoặc quá ngắn (< 32 ký tự).');
    passed = false;
  }

  // 3. Kiểm tra Mật khẩu Admin
  const passHash = process.env.ADMIN_PASSWORD_HASH || '';
  if (passHash && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passHash)) {
    console.log('  ✅ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH chuẩn scrypt 32-salt : 128-hash.');
  } else {
    console.warn('  ⚠️ [Mật Khẩu Admin] ADMIN_PASSWORD_HASH không đúng định dạng salt:scrypt.');
    passed = false;
  }

  // 4. Kiểm tra kết nối MongoDB & Replica Set
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    const isReplica = !!hello.setName || hello.msg === 'isdbgrid';
    if (isReplica) {
      console.log(`  ✅ [MongoDB] Đang chạy chế độ Replica Set (${hello.setName || 'Mongos Grid'}). Hỗ trợ ACID snapshot.`);
    } else {
      console.log('  ℹ️ [MongoDB] Đang chạy Standalone mode (Single-document atomicity).');
      if (process.env.ALLOW_STANDALONE !== 'true') {
        console.warn('     (Cần `npm run mongo:replica` hoặc thêm `ALLOW_STANDALONE=true` trong .env)');
      }
    }
    await client.close();
  } catch (err: any) {
    console.warn('  ⚠️ [MongoDB] Không thể kết nối tới cơ sở dữ liệu:', err.message);
    passed = false;
  }

  console.log('-------------------------------------------------------------------');
  if (passed) {
    console.log('🎉 TẤT CẢ TIÊU CHÍ ĐÃ ĐẠT CHUẨN SẴN SÀNG TRIỂN KHAI PRODUCTION!');
  } else {
    console.log('⚠️ Có một số mục cần bổ sung cấu hình trước khi chạy production.');
  }
}

void verify();
