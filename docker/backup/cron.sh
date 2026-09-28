#!/usr/bin/env bash
set -euo pipefail

# Automated MongoDB Backup & Retention Job for Tran Luu Badminton System
# Run via crontab: 0 2 * * * /path/to/project/docker/backup/cron.sh >> /var/log/tran_luu_backup.log 2>&1

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

echo "=================================================="
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting Automated Backup"
echo "=================================================="

# Execute Node/TSX backup dumper
npx tsx scripts/backup-mongodump.ts

echo "Running Disaster Recovery Drill test..."
npx tsx scripts/restore-drill.ts

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup & Drill Completed Successfully."
echo "=================================================="
