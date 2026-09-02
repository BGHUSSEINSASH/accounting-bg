import fs from 'fs';
import path from 'path';
import { getDatabase } from '../config/database';
import { logActivity } from '../utils/helpers';
import { syncSingleFile, removeSyncedFile } from './cloudSync';
import logger from '../utils/logger';

export interface BackupRecord {
  id: number;
  filename: string;
  size_bytes: number;
  created_by: number | null;
  created_at: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function getDbPath(): string {
  return process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'accounting.db');
}

export function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
}

export function getBackupFilePath(filename: string): string {
  return path.join(getBackupDir(), filename);
}

export function getBackupById(id: number): BackupRecord | null {
  const db = getDatabase();
  return (db.prepare("SELECT * FROM backups WHERE id = ?").get(id) as BackupRecord) || null;
}

export async function createBackup(userId: number | null): Promise<{ id: number; filename: string; size_bytes: number; created_at: string }> {
  const db = getDatabase();
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `backup-${timestamp}.db`;
  const destPath = path.join(backupDir, filename);

  await db.backup(destPath);
  const stats = fs.statSync(destPath);
  const result = db.prepare("INSERT INTO backups (filename, size_bytes, created_by) VALUES (?, ?, ?)").run(filename, stats.size, userId);
  if (userId) {
    logActivity(userId, 'create_backup', 'backup', Number(result.lastInsertRowid));
  }
  try {
    await syncSingleFile(destPath, 'backups');
  } catch (err: any) {
    logger.warn(`Cloud sync for new backup failed: ${err.message}`);
  }
  return {
    id: Number(result.lastInsertRowid),
    filename,
    size_bytes: stats.size,
    created_at: new Date().toISOString(),
  };
}

export async function deleteBackup(id: number): Promise<boolean> {
  const db = getDatabase();
  const backup = getBackupById(id);
  if (!backup) return false;
  const filePath = getBackupFilePath(backup.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  db.prepare("DELETE FROM backups WHERE id = ?").run(id);
  db.prepare("DELETE FROM share_links WHERE backup_id = ?").run(id);
  try {
    await removeSyncedFile(filePath, 'backups');
  } catch (err: any) {
    logger.warn(`Cloud delete for backup failed: ${err.message}`);
  }
  return true;
}

export async function restoreBackup(id: number): Promise<{ filename: string }> {
  const db = getDatabase();
  const backup = getBackupById(id);
  if (!backup) throw new Error('Backup not found');
  const backupPath = getBackupFilePath(backup.filename);
  if (!fs.existsSync(backupPath)) throw new Error('Backup file not found on disk');

  // Flush WAL so the main db file contains all committed data, then swap the file.
  db.pragma('wal_checkpoint(TRUNCATE)');
  const dbPath = getDbPath();
  fs.copyFileSync(backupPath, dbPath);
  return { filename: backup.filename };
}

export function enforceRetention(keep: number): number {
  const db = getDatabase();
  if (!keep || keep <= 0) return 0;
  const backups = db.prepare("SELECT id, filename FROM backups ORDER BY created_at DESC").all() as any[];
  if (backups.length <= keep) return 0;
  const toDelete = backups.slice(keep);
  for (const b of toDelete) {
    try {
      deleteBackup(b.id);
    } catch (err: any) {
      logger.warn(`Retention delete failed for backup #${b.id}: ${err.message}`);
    }
  }
  return toDelete.length;
}
