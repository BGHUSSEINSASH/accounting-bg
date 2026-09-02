import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query, queryOne, execute } from '../config/database';

const router = Router();

router.post('/schedule', authenticate, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { frequency, time, enabled } = req.body;
    await execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value", ['auto_backup_frequency', frequency || 'daily']);
    await execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value", ['auto_backup_time', time || '02:00']);
    await execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value", ['auto_backup_enabled', enabled ? '1' : '0']);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/schedule', authenticate, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const freq = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_frequency'") as any;
    const time = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_time'") as any;
    const enabled = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'auto_backup_enabled'") as any;
    res.json({ frequency: freq?.setting_value || 'daily', time: time?.setting_value || '02:00', enabled: enabled?.setting_value === '1' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
