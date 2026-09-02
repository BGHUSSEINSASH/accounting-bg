import { getDatabase } from '../config/database';
import { createBackup, enforceRetention } from './backupService';
import logger from '../utils/logger';

let timer: NodeJS.Timeout | null = null;

function getSetting(key: string, fallback: string): string {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT setting_value FROM settings WHERE setting_key = ?").get(key) as any;
    return row?.setting_value ?? fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: string): void {
  try {
    const db = getDatabase();
    db.prepare("INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, value);
  } catch (err: any) {
    logger.error(`Failed to save setting ${key}: ${err.message}`);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function isDue(): boolean {
  const enabled = getSetting('auto_backup_enabled', '0') === '1';
  if (!enabled) return false;

  const frequency = getSetting('auto_backup_frequency', getSetting('auto_backup_interval', 'daily')).toLowerCase();
  const lastRun = getSetting('auto_backup_last_run', '');
  const now = new Date();
  const last = lastRun ? new Date(lastRun) : null;

  if (frequency === 'hourly') {
    return !last || now.getTime() - last.getTime() >= HOUR;
  }
  if (frequency === 'weekly') {
    return !last || now.getTime() - last.getTime() >= 7 * DAY;
  }
  if (frequency === 'monthly') {
    return !last || now.getTime() - last.getTime() >= 30 * DAY;
  }

  // daily
  const time = getSetting('auto_backup_time', '02:00');
  const [h, m] = time.split(':').map(Number);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const targetMin = (h || 0) * 60 + (m || 0);
  if (currentMin < targetMin) return false;
  if (!last) return true;
  return last.toDateString() !== now.toDateString();
}

export async function runBackupCycle(): Promise<boolean> {
  if (!isDue()) return false;
  try {
    const result = await createBackup(null);
    setSetting('auto_backup_last_run', new Date().toISOString());
    const retention = parseInt(getSetting('auto_backup_retention', '30'), 10);
    if (retention > 0) {
      const removed = enforceRetention(retention);
      logger.info(`Auto backup retention: kept ${retention}, removed ${removed}`);
    }
    logger.info(`Scheduled auto backup created: ${result.filename}`);
    return true;
  } catch (err: any) {
    logger.error(`Scheduled auto backup failed: ${err.message}`);
    return false;
  }
}

export function startBackupScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    runBackupCycle().catch(() => {});
  }, 60 * 1000);
  logger.info('Auto backup scheduler started (checking every 60s)');
}
