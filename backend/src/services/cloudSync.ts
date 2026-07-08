import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { buildCloudKey, deleteFromCloud, getCloudStatus, guessContentType, isCloudConfigured, uploadToCloud } from './cloudStorage';

interface SyncRecord {
  mtimeMs: number;
  size: number;
  key: string;
  cloudUrl: string | null;
  syncedAt: string;
}

interface SyncState {
  records: Record<string, SyncRecord>;
}

const statePath = path.join(__dirname, '..', '..', 'data', 'cloud-sync-state.json');
let syncPromise: Promise<any> | null = null;

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
}

function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
}

function ensureStateDir(): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState(): SyncState {
  try {
    if (!fs.existsSync(statePath)) return { records: {} };
    return JSON.parse(fs.readFileSync(statePath, 'utf8')) as SyncState;
  } catch {
    return { records: {} };
  }
}

function saveState(state: SyncState): void {
  ensureStateDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function listFilesRecursive(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const result: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(absolutePath));
    } else {
      result.push(absolutePath);
    }
  }
  return result;
}

function relativeSyncKey(rootDir: string, filePath: string, prefix: string): string {
  const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
  return buildCloudKey(`${prefix}/${relativePath}`);
}

async function syncFile(state: SyncState, rootDir: string, filePath: string, prefix: string): Promise<'uploaded' | 'skipped' | 'failed'> {
  if (!isCloudConfigured()) return 'skipped';
  const stats = fs.statSync(filePath);
  const key = relativeSyncKey(rootDir, filePath, prefix);
  const previous = state.records[filePath];
  if (previous && previous.mtimeMs === stats.mtimeMs && previous.size === stats.size && previous.key === key) {
    return 'skipped';
  }

  const contentType = guessContentType(filePath);
  const cloudUrl = await uploadToCloud(key, filePath, contentType);
  state.records[filePath] = {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    key,
    cloudUrl,
    syncedAt: new Date().toISOString(),
  };
  return 'uploaded';
}

export async function syncLocalFiles(): Promise<{ uploaded: number; skipped: number; failed: number }> {
  if (!isCloudConfigured()) {
    return { uploaded: 0, skipped: 0, failed: 0 };
  }
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const state = loadState();
    const uploadDir = getUploadDir();
    const backupDir = getBackupDir();
    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const filePath of listFilesRecursive(uploadDir)) {
      try {
        const result = await syncFile(state, uploadDir, filePath, 'uploads');
        if (result === 'uploaded') uploaded += 1;
        else if (result === 'skipped') skipped += 1;
      } catch (err: any) {
        failed += 1;
        logger.error(`Cloud sync failed for ${filePath}: ${err.message}`);
      }
    }

    for (const filePath of listFilesRecursive(backupDir)) {
      try {
        const result = await syncFile(state, backupDir, filePath, 'backups');
        if (result === 'uploaded') uploaded += 1;
        else if (result === 'skipped') skipped += 1;
      } catch (err: any) {
        failed += 1;
        logger.error(`Cloud sync failed for ${filePath}: ${err.message}`);
      }
    }

    saveState(state);
    return { uploaded, skipped, failed };
  })();

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

export async function syncSingleFile(filePath: string, prefix: 'uploads' | 'backups'): Promise<void> {
  if (!isCloudConfigured() || !fs.existsSync(filePath)) return;
  const state = loadState();
  const rootDir = prefix === 'uploads' ? getUploadDir() : getBackupDir();
  await syncFile(state, rootDir, filePath, prefix);
  saveState(state);
}

export async function removeSyncedFile(filePath: string, prefix: 'uploads' | 'backups'): Promise<void> {
  if (!isCloudConfigured()) return;
  const state = loadState();
  const rootDir = prefix === 'uploads' ? getUploadDir() : getBackupDir();
  const key = relativeSyncKey(rootDir, filePath, prefix);
  try {
    await deleteFromCloud(key);
  } catch (err: any) {
    logger.warn(`Cloud delete failed for ${key}: ${err.message}`);
  }
  delete state.records[filePath];
  saveState(state);
}

export function getCloudSyncSummary(): Record<string, unknown> {
  const state = loadState();
  return {
    status: getCloudStatus(),
    trackedFiles: Object.keys(state.records).length,
    uploadsDir: getUploadDir(),
    backupsDir: getBackupDir(),
  };
}
