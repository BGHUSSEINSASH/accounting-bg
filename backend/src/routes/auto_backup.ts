import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { getDatabase } from '../config/database';

const router = Router();

router.post('/schedule', authenticate, authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { frequency, time, enabled } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)").run('auto_backup_frequency', frequency || 'daily');
    db.prepare("INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)").run('auto_backup_time', time || '02:00');
    db.prepare("INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)").run('auto_backup_enabled', enabled ? '1' : '0');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/schedule', authenticate, authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const frequency = (db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_frequency'").get() as any)?.setting_value || 'daily';
    const time = (db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_time'").get() as any)?.setting_value || '02:00';
    const enabled = (db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_enabled'").get() as any)?.setting_value === '1';
    res.json({ frequency, time, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
