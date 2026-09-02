import { Router, Response } from 'express';
import fs from 'fs';
import { queryOne } from '../config/database';
import { getBackupFilePath } from '../services/backupService';

const router = Router();

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 20;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimit(req: any): boolean {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) { entry = { count: 0, resetAt: now + WINDOW_MS }; attempts.set(ip, entry); }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

router.get('/:token', async (req: any, res: Response) => {
  try {
    if (!rateLimit(req)) return res.status(429).json({ error: 'Too many attempts, try again later' });
    const link = await queryOne("SELECT * FROM share_links WHERE token = ?", [req.params.token]) as any;
    if (!link) return res.status(404).json({ error: 'Share link not found' });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'Share link has expired' });
    const backup = await queryOne("SELECT * FROM backups WHERE id = ?", [link.backup_id]) as any;
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    const filePath = getBackupFilePath(backup.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup file not found on disk' });
    res.download(filePath, backup.filename);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
