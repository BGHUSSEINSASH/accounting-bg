import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { getWhatsAppConfig, sendWhatsAppMessage } from '../services/whatsappService';

const router = Router();
router.use(authenticate);

router.get('/config', async (_req: AuthRequest, res: Response) => {
  try {
    res.json(getWhatsAppConfig());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/config', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { provider, api_token, account_sid, phone_number_id, business_phone, api_url, is_active } = req.body;
    const existing = await queryOne('SELECT id FROM whatsapp_config LIMIT 1') as { id: number } | undefined;
    if (existing) {
      await execute(`UPDATE whatsapp_config SET provider = COALESCE(?, provider), api_token = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE api_token END, account_sid = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE account_sid END, phone_number_id = COALESCE(?, phone_number_id), business_phone = COALESCE(?, business_phone), api_url = COALESCE(?, api_url), is_active = COALESCE(?, is_active), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [provider || null, api_token, api_token, api_token, account_sid, account_sid, account_sid, phone_number_id || null, business_phone || null, api_url || null, is_active ?? null, req.user!.id, existing.id]);
    } else {
      await execute('INSERT INTO whatsapp_config (provider, api_token, account_sid, phone_number_id, business_phone, api_url, is_active, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [provider || 'meta', api_token || '', account_sid || '', phone_number_id || '', business_phone || '', api_url || '', is_active ?? 0, req.user!.id]);
    }
    void logActivityAsync(req.user!.id, 'update_whatsapp_config', 'whatsapp_config');
    res.json({ message: 'تم حفظ إعدادات واتساب' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/send', authorize('admin', 'manager', 'sales_rep'), async (req: AuthRequest, res: Response) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'الرقم والرسالة مطلوبان' });
    const result = await sendWhatsAppMessage(to, message, req.user!.id);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/test', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'الرقم والرسالة مطلوبان' });
    const result = await sendWhatsAppMessage(to, message, req.user!.id);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/messages', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT wm.*, u.username as sent_by FROM whatsapp_messages wm LEFT JOIN users u ON wm.created_by = u.id ORDER BY wm.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
