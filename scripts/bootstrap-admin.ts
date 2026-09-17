import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { DB_NAME } from '../server/db.js';
import { bootstrapAdminUser } from '../server/seedData.js';

function maskMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  }
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const envAdmin = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const username = (process.argv[2] || process.env.BOOTSTRAP_ADMIN_USER || '').trim().toLowerCase();
  const password = process.argv[3] || process.env.BOOTSTRAP_ADMIN_PASS;

  if (!username) {
    console.error('Usage: npx tsx scripts/bootstrap-admin.ts <username> <strong-password>');
    console.error("Lưu ý: <username> không được đặt trùng với tài khoản quản trị viên ENV ('" + envAdmin + "').");
    process.exit(1);
  }

  if (username === envAdmin) {
    console.error(`[Bootstrap Error] Không thể tạo tài khoản DB trùng tên với tài khoản quản trị viên ENV ('${envAdmin}').`);
    console.error("Vui lòng chọn tên đăng nhập khác (ví dụ: 'superadmin', 'quanly').");
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('Usage: npx tsx scripts/bootstrap-admin.ts <username> <strong-password>');
    console.error('Mật khẩu tối thiểu 8 ký tự.');
    process.exit(1);
  }

  console.log(`[Bootstrap] Đang kết nối tới cơ sở dữ liệu MongoDB: ${maskMongoUri(uri)}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.DB_NAME || DB_NAME);

  const result = await bootstrapAdminUser(db, {
    username,
    password,
    fullName: 'Quản Trị Viên Sân Trần Lựu',
    force: false
  });

  console.log(`[Bootstrap] ${result.message}`);
  await client.close();
}

void main().catch(err => {
  console.error('[Bootstrap Error]:', err.message);
  process.exit(1);
});
