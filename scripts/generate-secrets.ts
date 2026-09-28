import { randomBytes, scryptSync } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type DeployTarget = 'production' | 'staging';

function targetFromArgs(): DeployTarget {
  const target = process.argv.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'production';
  if (target !== 'production' && target !== 'staging') {
    throw new Error('Target không hợp lệ. Chỉ hỗ trợ --target=production hoặc --target=staging.');
  }
  return target;
}

function generate() {
  const target = targetFromArgs();
  const isStaging = target === 'staging';
  const envFileName = isStaging ? '.env.staging' : '.env.production';
  const envPath = path.resolve(envFileName);
  const mongoKeyfileSetting = isStaging ? './docker/secrets/mongo-keyfile-staging' : './docker/secrets/mongo-keyfile';
  const mongoKeyfilePath = path.resolve(mongoKeyfileSetting);

  if (existsSync(envPath)) {
    console.log(`[SKIP] ${envFileName} đã tồn tại; không ghi đè hoặc xoay secret ngoài ý muốn.`);
    ensureHealthToken(envPath);
    ensureMongoKeyfile(mongoKeyfilePath);
    return;
  }

  const qrSecret = randomBytes(32).toString('hex');
  const cookieSecret = randomBytes(32).toString('hex');
  const salt = randomBytes(16).toString('hex');
  const adminPassword = randomBytes(12).toString('base64url');
  const adminPasswordHash = `${salt}:${scryptSync(adminPassword, salt, 64).toString('hex')}`;
  const mongoRootPassword = randomBytes(24).toString('hex');
  const mongoAppPassword = randomBytes(24).toString('hex');
  const redisPassword = randomBytes(24).toString('hex');
  const backupKey = randomBytes(32).toString('hex');
  const healthToken = randomBytes(32).toString('hex');
  const subnet = isStaging ? '172.30.0.0/24' : '172.29.0.0/24';

  ensureMongoKeyfile(mongoKeyfilePath);

  const envContent = [
    'NODE_ENV=production',
    `APP_ENV=${target}`,
    `COMPOSE_PROJECT_NAME=tran-luu-${target}`,
    `ENV_FILE=${envFileName}`,
    `PORT=${isStaging ? '3002' : '3001'}`,
    `PUBLIC_ORIGIN=https://${isStaging ? 'staging.' : ''}change-me.example.com`,
    `QR_SIGN_SECRET=${qrSecret}`,
    'QR_SIGN_SECRET_LEGACY=',
    'QR_ALLOW_LEGACY_TAGS=false',
    `COOKIE_SECRET=${cookieSecret}`,
    'ADMIN_USERNAME=admin',
    `ADMIN_PASSWORD_HASH=${adminPasswordHash}`,
    `MONGO_ROOT_USER=${isStaging ? 'mongoadmin_staging' : 'mongoadmin'}`,
    `MONGO_ROOT_PASSWORD=${mongoRootPassword}`,
    `MONGO_APP_USER=${isStaging ? 'appuser_staging' : 'appuser'}`,
    `MONGO_APP_PASSWORD=${mongoAppPassword}`,
    `MONGO_KEYFILE_PATH=${mongoKeyfileSetting}`,
    `DB_NAME=tran_luu_qr_order${isStaging ? '_staging' : ''}`,
    'ALLOW_STANDALONE=false',
    `REDIS_PASSWORD=${redisPassword}`,
    'REDIS_ENABLED=true',
    `BACKUP_ENCRYPTION_KEY=${backupKey}`,
    `INTERNAL_HEALTH_TOKEN=${healthToken}`,
    `PROXY_SUBNET=${subnet}`,
    `TRUSTED_PROXY_CIDRS=${subnet}`,
    'MONGO_MIN_POOL_SIZE=2',
    `MONGO_MAX_POOL_SIZE=${isStaging ? '20' : '50'}`,
    'API_DOCS_ENABLED=false',
    'BACKUP_INTERVAL_HOURS=24',
    `BACKUP_OFFSITE_HOST_PATH=./backups-offsite-${target}`,
    'LOG_LEVEL=info',
    'LOG_REQUESTS=false',
    'LOG_INCLUDE_STACK=false',
    ''
  ].join('\n');
  writeFileSync(envPath, envContent, { mode: 0o600, flag: 'wx' });

  console.log(`[OK] Đã tạo ${envPath} với bộ secret ${target} độc lập.`);
  console.log(`[ACTION] Hãy thay PUBLIC_ORIGIN bằng domain HTTPS ${target} thật trước khi deploy.`);
  if (!process.env.CI) console.log(`Mật khẩu admin ${target} sinh một lần: ${adminPassword}`);
}

function ensureHealthToken(envPath: string) {
  const current = readFileSync(envPath, 'utf8');
  if (/^INTERNAL_HEALTH_TOKEN=.+$/m.test(current) || /^HEALTH_CHECK_TOKEN=.+$/m.test(current)) return;
  const prefix = current.endsWith('\n') ? '' : '\n';
  appendFileSync(envPath, `${prefix}INTERNAL_HEALTH_TOKEN=${randomBytes(32).toString('hex')}\n`, { encoding: 'utf8' });
  console.log('[OK] Đã bổ sung INTERNAL_HEALTH_TOKEN còn thiếu mà không thay đổi secret hiện có.');
}

function ensureMongoKeyfile(keyfilePath: string) {
  const secretsDir = path.dirname(keyfilePath);
  if (!existsSync(secretsDir)) mkdirSync(secretsDir, { recursive: true });
  if (!existsSync(keyfilePath)) {
    writeFileSync(keyfilePath, randomBytes(756).toString('base64'), { mode: 0o400 });
    console.log(`[OK] Đã tạo mới ${keyfilePath}.`);
  }
}

generate();
