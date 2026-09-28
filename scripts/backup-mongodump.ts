import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MongoClient, BSON } from 'mongodb';
import dotenv from 'dotenv';
import { maskUriCredentials } from '../server/utils/maskUri.js';

// Load environment: prioritize .env.production, then .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(rootDir, '.env.production'))) {
  dotenv.config({ path: path.join(rootDir, '.env.production') });
} else {
  dotenv.config({ path: path.join(rootDir, '.env') });
}

const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.resolve(rootDir, 'backups');
const DB_NAME = process.env.DB_NAME || 'tran_luu_qr_order';
const RAW_MONGO_URI = process.env.MONGO_URI || `mongodb://127.0.0.1:27017/${DB_NAME}`;

function encryptionSecret(): string {
  const secret = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) throw new Error('BACKUP_ENCRYPTION_KEY bắt buộc và phải dài ít nhất 32 ký tự.');
  return secret;
}

function encryptBuffer(data: Buffer, secret: string): Buffer {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secret, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('TLBU2'), salt, iv, tag, encrypted]);
}

export async function runBackup(options?: { destinationDir?: string }): Promise<{ backupFile: string; shaFile: string; stats: Record<string, number> }> {
  const targetDir = options?.destinationDir || BACKUP_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const effectiveMongoUri = RAW_MONGO_URI;
  const maskedUri = maskUriCredentials(effectiveMongoUri);
  console.log(`[Backup] Connecting to MongoDB: ${maskedUri}...`);

  const client = new MongoClient(effectiveMongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  console.log(`[Backup] Connected. Dumping database: ${DB_NAME}...`);

  try {
    const db = client.db(DB_NAME);
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const backupEnvelope: Record<string, any> = {
      system: 'tran-luu-badminton-qr-order',
      schemaVersion: '2.0.0',
      database: DB_NAME,
      exportedAt: new Date().toISOString(),
      collections: {},
      metadata: {}
    };

    const stats: Record<string, number> = {};

    const hello = await client.db('admin').command({ hello: 1 });
    const replicaSet = Boolean(hello.setName || hello.msg === 'isdbgrid');
    if (process.env.NODE_ENV === 'production' && !replicaSet) {
      throw new Error('Backup production yêu cầu MongoDB Replica Set để tạo snapshot nhất quán.');
    }
    const session = replicaSet ? client.startSession() : undefined;
    try {
      if (session) session.startTransaction({ readConcern: { level: 'snapshot' } });
      for (const col of collections) {
        if (col.name.startsWith('system.')) continue;
        const collection = db.collection(col.name);
        const docs = await collection.find({}, session ? { session } : {}).toArray();
        backupEnvelope.collections[col.name] = docs;
        backupEnvelope.metadata[col.name] = {
          options: col.options || {},
          indexes: await collection.indexes()
        };
        stats[col.name] = docs.length;
        console.log(` - Collection '${col.name}': ${docs.length} documents`);
      }
      if (session) await session.commitTransaction();
    } catch (error) {
      if (session?.inTransaction()) await session.abortTransaction();
      throw error;
    } finally {
      await session?.endSession();
    }

    // High fidelity EJSON stringify (preserves ObjectId, Date, Long, Binary)
    const jsonStr = BSON.EJSON.stringify(backupEnvelope);
    const jsonBuffer = Buffer.from(jsonStr, 'utf-8');

    console.log(`[Backup] Raw JSON size: ${(jsonBuffer.length / 1024).toFixed(2)} KB. Compressing gzip...`);
    const gzipBuffer = zlib.gzipSync(jsonBuffer, { level: 9 });
    console.log(`[Backup] Gzip size: ${(gzipBuffer.length / 1024).toFixed(2)} KB. Encrypting with AES-256-GCM...`);

    const encryptedBuffer = encryptBuffer(gzipBuffer, encryptionSecret());
    console.log(`[Backup] Encrypted size: ${(encryptedBuffer.length / 1024).toFixed(2)} KB.`);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
    const filename = `backup_tran_luu_${timestamp}.enc.gz`;
    const backupFilePath = path.join(targetDir, filename);

    fs.writeFileSync(backupFilePath, encryptedBuffer);

    // Compute SHA-256 checksum
    const sha256 = crypto.createHash('sha256').update(encryptedBuffer).digest('hex');
    const shaFilePath = `${backupFilePath}.sha256`;
    fs.writeFileSync(shaFilePath, `${sha256}  ${filename}\n`, 'utf-8');

    const offsiteDir = process.env.BACKUP_OFFSITE_DIR?.trim();
    if (offsiteDir) {
      const resolvedOffsite = path.resolve(offsiteDir);
      if (resolvedOffsite === path.resolve(targetDir)) {
        throw new Error('BACKUP_OFFSITE_DIR phải khác thư mục backup chính.');
      }
      fs.mkdirSync(resolvedOffsite, { recursive: true });
      const offsiteBackup = path.join(resolvedOffsite, filename);
      const offsiteSha = `${offsiteBackup}.sha256`;
      fs.copyFileSync(backupFilePath, offsiteBackup);
      fs.copyFileSync(shaFilePath, offsiteSha);
      const copiedHash = crypto.createHash('sha256').update(fs.readFileSync(offsiteBackup)).digest('hex');
      if (copiedHash !== sha256) {
        fs.rmSync(offsiteBackup, { force: true });
        fs.rmSync(offsiteSha, { force: true });
        throw new Error('Checksum của bản sao off-site không khớp; backup bị từ chối.');
      }
      pruneOldBackups(resolvedOffsite);
      console.log(`[Backup Off-site] Verified encrypted copy: ${offsiteBackup}`);
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('BACKUP_OFFSITE_DIR bắt buộc trong production để tránh mất đồng thời DB và backup local.');
    }

    console.log(`[Backup Success] File saved: ${backupFilePath}`);
    console.log(`[Backup SHA-256]: ${sha256}`);

    // Run Retention Pruning
    pruneOldBackups(targetDir);

    return {
      backupFile: backupFilePath,
      shaFile: shaFilePath,
      stats
    };
  } finally {
    await client.close();
  }
}

function pruneOldBackups(backupDir: string) {
  try {
    const files = fs.readdirSync(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('backup_tran_luu_') && f.endsWith('.enc.gz'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stats = fs.statSync(fullPath);
        return { name: f, path: fullPath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
    const TWENTY_EIGHT_DAYS_MS = 28 * ONE_DAY_MS;

    let keptCount = 0;
    let purgedCount = 0;

    for (const file of backupFiles) {
      const ageMs = now - file.mtime;

      // Keep all within 7 days
      if (ageMs < SEVEN_DAYS_MS) {
        keptCount++;
        continue;
      }

      // Between 7 and 28 days: keep one backup per week (simplest: if age < 28 days, keep)
      if (ageMs < TWENTY_EIGHT_DAYS_MS) {
        keptCount++;
        continue;
      }

      // Older than 28 days -> purge
      try {
        fs.unlinkSync(file.path);
        const shaPath = `${file.path}.sha256`;
        if (fs.existsSync(shaPath)) {
          fs.unlinkSync(shaPath);
        }
        purgedCount++;
        console.log(`[Retention] Purged expired backup: ${file.name}`);
      } catch (err) {
        console.warn(`[Retention] Error deleting ${file.name}:`, err);
      }
    }

    console.log(`[Retention Summary] Retained ${keptCount} backups. Purged ${purgedCount} expired backups.`);
  } catch (err) {
    console.warn('[Retention Error] Failed running retention check:', err);
  }
}

// Execute when invoked directly
const isDirectCall = process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)));
if (isDirectCall) {
  runBackup()
    .then(() => {
      console.log('[Backup Finished Successfully]');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Backup Failed]:', err);
      process.exit(1);
    });
}
