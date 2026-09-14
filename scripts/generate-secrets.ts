import { randomBytes, scryptSync } from 'node:crypto';

function generate() {
  const qrSecret = randomBytes(32).toString('hex'); // 64-char crypto hex string
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(12).toString('base64url'); // strong 16-char random password
  const derived = scryptSync(password, salt, 64).toString('hex');
  const adminPasswordHash = `${salt}:${derived}`;

  console.log('\n===================================================================');
  console.log('🔑 BỘ SECRET BẢO MẬT PRODUCTION ĐƯỢC SINH NGẪU NHIÊN:');
  console.log('===================================================================');
  console.log(`QR_SIGN_SECRET=${qrSecret}`);
  console.log(`ADMIN_USERNAME=admin`);
  console.log(`MẬT KHẨU GỐC ADMIN: ${password}   (Hãy lưu lại mật khẩu này!)`);
  console.log(`ADMIN_PASSWORD_HASH=${adminPasswordHash}`);
  console.log('===================================================================\n');
}

generate();
