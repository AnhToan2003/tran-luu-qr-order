import * as fs from 'node:fs';
import * as path from 'node:path';
import { runBackup } from './backup-mongodump.js';
import { runRestoreDrill } from './restore-drill.js';

const intervalHours = Math.min(168, Math.max(1, Number.parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10) || 24));
const heartbeatFile = process.env.BACKUP_HEARTBEAT_FILE || '/tmp/backup-heartbeat';

async function executeCycle() {
  const backup = await runBackup();
  const drill = await runRestoreDrill({ backupFilePath: backup.backupFile });
  if (!drill.success) throw new Error('Restore drill did not report success.');
  fs.mkdirSync(path.dirname(heartbeatFile), { recursive: true });
  fs.writeFileSync(heartbeatFile, new Date().toISOString(), 'utf8');
}

async function main() {
  for (;;) {
    await executeCycle();
    await new Promise(resolve => setTimeout(resolve, intervalHours * 60 * 60 * 1000));
  }
}

main().catch(error => {
  console.error('[Backup Scheduler Fatal]', error instanceof Error ? error.message : error);
  process.exit(1);
});
