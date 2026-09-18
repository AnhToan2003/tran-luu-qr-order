// Cross-platform production starter for Tran Luu Badminton & Drinks System
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// 1. Lưu lại snapshot toàn bộ biến môi trường do hệ thống / Cloud / Docker cung cấp
const hostEnv = { ...process.env };

// 2. Nạp .env.production nếu có (không ghi đè biến của máy chủ)
const prodEnvPath = path.resolve('.env.production');
if (existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: false });
} else {
  dotenv.config({ override: false });
}

// 3. Khôi phục lại toàn bộ biến host để đảm bảo tính ưu tiên tuyệt đối của Cloud / Server
for (const [key, value] of Object.entries(hostEnv)) {
  if (value !== undefined) {
    process.env[key] = value;
  }
}

// Bắt buộc chế độ production
process.env.NODE_ENV = 'production';

console.log('🚀 Đang khởi động hệ thống ở chế độ PRODUCTION...');
console.log(`- Cổng dịch vụ (PORT): ${process.env.PORT || 3001}`);
console.log(`- Cơ sở dữ liệu (DB_NAME): ${process.env.DB_NAME || 'tran_luu_qr_order'}`);
console.log(`- Nguồn gốc cho phép (PUBLIC_ORIGIN): ${process.env.PUBLIC_ORIGIN || 'Tự động theo Host'}`);
console.log(`- Standalone MongoDB: ${process.env.ALLOW_STANDALONE === 'true' ? 'BẬT (Cho phép kiểm thử đơn lẻ)' : 'TẮT (Yêu cầu Replica Set)'}`);

await import('../dist-server/index.js');
