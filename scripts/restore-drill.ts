import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MongoClient, BSON } from 'mongodb';
import dotenv from 'dotenv';
import { maskUriCredentials } from '../server/utils/maskUri.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(rootDir, '.env.production'))) {
  dotenv.config({ path: path.join(rootDir, '.env.production') });
} else {
  dotenv.config({ path: path.join(rootDir, '.env') });
}

const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.resolve(rootDir, 'backups');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tran_luu_qr_order';
const ENCRYPTION_SECRET = process.env.BACKUP_ENCRYPTION_KEY || 'tran-luu-secure-backup-key-default-2026';
const DRILL_DB_NAME = 'test_drill_restore';

function decryptBuffer(encryptedData: Buffer, secret: string): Buffer {
  if (encryptedData.subarray(0, 5).toString('utf8') === 'TLBU2') {
    if (encryptedData.length < 5 + 16 + 12 + 16) {
      throw new Error('Encrypted backup buffer is too small for TLBU2 payload');
    }
    const salt = encryptedData.subarray(5, 21);
    const iv = encryptedData.subarray(21, 33);
    const tag = encryptedData.subarray(33, 49);
    const ciphertext = encryptedData.subarray(49);
    const key = crypto.scryptSync(secret, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // Fallback for older backups (aes-256-cbc with 16-byte IV)
  if (encryptedData.length < 17) {
    throw new Error('Encrypted backup buffer is too small to contain IV and data');
  }
  const key = crypto.scryptSync(secret, 'salt_tran_luu_backup_v2', 32);
  const iv = encryptedData.subarray(0, 16);
  const ciphertext = encryptedData.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function runRestoreDrill(options?: { backupFilePath?: string; keepDrillDb?: boolean }): Promise<{
  success: boolean;
  backupFile: string;
  collectionsRestored: Record<string, number>;
  totalDocuments: number;
}> {
  let targetFile = options?.backupFilePath;

  if (!targetFile) {
    if (!fs.existsSync(BACKUP_DIR)) {
      throw new Error(`Backup directory ${BACKUP_DIR} does not exist`);
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_tran_luu_') && f.endsWith('.enc.gz'))
      .map(f => {
        const full = path.join(BACKUP_DIR, f);
        return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      throw new Error(`No encrypted backup files (.enc.gz) found in ${BACKUP_DIR}`);
    }
    targetFile = files[0].path;
  }

  console.log(`[Restore Drill] Selected backup file: ${targetFile}`);

  // 1. Verify SHA-256
  const shaPath = `${targetFile}.sha256`;
  const fileBuffer = fs.readFileSync(targetFile);
  const calculatedSha = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  if (fs.existsSync(shaPath)) {
    const shaContent = fs.readFileSync(shaPath, 'utf-8').trim();
    const expectedSha = shaContent.split(/\s+/)[0];
    if (calculatedSha.toLowerCase() !== expectedSha.toLowerCase()) {
      throw new Error(`SHA-256 Checksum mismatch! Expected ${expectedSha} but got ${calculatedSha}`);
    }
    console.log(`[Restore Drill] SHA-256 Checksum VERIFIED: ${calculatedSha}`);
  } else {
    console.warn(`[Restore Drill] Warning: No .sha256 file found at ${shaPath}. Integrity check skipped.`);
  }

  // 2. Decrypt
  console.log('[Restore Drill] Decrypting backup payload...');
  const decryptedGzip = decryptBuffer(fileBuffer, ENCRYPTION_SECRET);

  // 3. Decompress Gzip
  console.log('[Restore Drill] Decompressing gzip payload...');
  const rawJsonBuffer = zlib.gunzipSync(decryptedGzip);

  // 4. Parse EJSON
  console.log('[Restore Drill] Parsing Extended JSON envelope...');
  const parsedEnvelope: any = BSON.EJSON.parse(rawJsonBuffer.toString('utf-8'));

  if (!parsedEnvelope || !parsedEnvelope.collections) {
    throw new Error('Invalid backup structure: missing collections key in envelope');
  }

  console.log(`[Restore Drill] Source DB: ${parsedEnvelope.database}, Exported At: ${parsedEnvelope.exportedAt}`);

  // 5. Connect and Restore into isolated DRILL_DB_NAME
  const maskedUri = maskUriCredentials(MONGO_URI);
  console.log(`[Restore Drill] Connecting to MongoDB: ${maskedUri}...`);
  const client = new MongoClient(MONGO_URI, { directConnection: true, serverSelectionTimeoutMS: 8000 });
  await client.connect();

  try {
    const drillDb = client.db(DRILL_DB_NAME);
    // Drop drill db before drill to ensure clean isolation
    await drillDb.dropDatabase();
    console.log(`[Restore Drill] Initialized clean drill database '${DRILL_DB_NAME}'`);

    const collectionsRestored: Record<string, number> = {};
    let totalDocuments = 0;

    for (const [colName, docs] of Object.entries(parsedEnvelope.collections)) {
      if (!Array.isArray(docs)) continue;
      if (docs.length > 0) {
        await drillDb.collection(colName).insertMany(docs);
      }
      const count = await drillDb.collection(colName).countDocuments();
      collectionsRestored[colName] = count;
      totalDocuments += count;
      console.log(` - Restored collection '${colName}': ${count} documents verified`);
    }

    console.log(`[Restore Drill Result] Total collections: ${Object.keys(collectionsRestored).length}, Total documents: ${totalDocuments}`);

    // Drop drill db after successful verification unless keepDrillDb is true
    if (!options?.keepDrillDb) {
      await drillDb.dropDatabase();
      console.log(`[Restore Drill Clean] Successfully dropped drill database '${DRILL_DB_NAME}'`);
    }

    return {
      success: true,
      backupFile: targetFile,
      collectionsRestored,
      totalDocuments
    };
  } finally {
    await client.close();
  }
}

// Direct execution
const isDirectCall = process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)));
if (isDirectCall) {
  const customFile = process.argv[2];
  runRestoreDrill({ backupFilePath: customFile })
    .then((res) => {
      console.log('==============================================');
      console.log('✅ DISASTER RECOVERY DRILL: PASSED');
      console.log(`Backup: ${res.backupFile}`);
      console.log(`Verified Documents: ${res.totalDocuments}`);
      console.log('==============================================');
      process.exit(0);
    })
    .catch((err) => {
      console.error('==============================================');
      console.error('❌ DISASTER RECOVERY DRILL: FAILED');
      console.error(err);
      console.error('==============================================');
      process.exit(1);
    });
}
