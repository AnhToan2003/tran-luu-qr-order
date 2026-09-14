import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  console.log(`[MongoDB Setup] Đang kết nối tới ${uri}...`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });

    if (hello.setName) {
      console.log(`✅ MongoDB đã chạy chế độ Replica Set: "${hello.setName}". Không cần thao tác thêm!`);
      process.exit(0);
    }

    console.log('[MongoDB Setup] Đang khởi tạo Replica Set (rs0)...');
    try {
      await client.db('admin').command({ replSetInitiate: {} });
      console.log('✅ Khởi tạo Replica Set thành công! MongoDB hiện đã sẵn sàng cho ACID Transactions.');
    } catch (initErr: any) {
      if (initErr.codeName === 'AlreadyInitialized' || initErr.message?.includes('already initialized')) {
        console.log('✅ Replica Set đã được khởi tạo từ trước.');
      } else {
        console.warn('⚠️ Lệnh replSetInitiate trả về:', initErr.message);
        console.log('\n💡 Hướng dẫn cấu hình thủ công nếu mongod chưa bật cờ --replSet:');
        console.log('  1. Mở file cấu hình mongod.cfg (hoặc /etc/mongod.conf)');
        console.log('  2. Thêm dòng sau:');
        console.log('     replication:');
        console.log('       replSetName: rs0');
        console.log('  3. Khởi động lại dịch vụ MongoDB và chạy lại lệnh này.');
      }
    }
  } catch (err: any) {
    console.error('❌ Không thể kết nối tới MongoDB:', err.message);
  } finally {
    await client.close();
  }
}

void main();
