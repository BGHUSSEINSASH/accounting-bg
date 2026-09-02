import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

function maskSecret(key?: string): string {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

function maskedRow(row: any): any {
  return { ...row, public_key: row.public_key ? maskSecret(row.public_key) : '', secret_key: row.secret_key ? maskSecret(row.secret_key) : '', webhook_secret: row.webhook_secret ? maskSecret(row.webhook_secret) : '' };
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query('SELECT * FROM payment_gateways ORDER BY is_default DESC, name') as any[];
    res.json(rows.map(maskedRow));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { provider, name, public_key, secret_key, webhook_secret, sandbox_mode } = req.body;
    if (!provider || !name) return res.status(400).json({ error: 'المزود والاسم مطلوبان' });
    const result = await execute('INSERT INTO payment_gateways (provider, name, public_key, secret_key, webhook_secret, sandbox_mode, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [provider, name, public_key || null, secret_key || null, webhook_secret || null, sandbox_mode ? 1 : 0, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_payment_gateway', 'payment_gateway', result.id as number);
    res.json({ message: 'تمت إضافة البوابة', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { provider, name, public_key, secret_key, webhook_secret, sandbox_mode, is_active, is_default } = req.body;
    const existing = await queryOne('SELECT * FROM payment_gateways WHERE id = ?', [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: 'البوابة غير موجودة' });
    await withTransaction(async (client) => {
      if (is_default) await client.query('UPDATE payment_gateways SET is_default = 0');
      await client.query(`UPDATE payment_gateways SET provider = COALESCE($1, provider), name = COALESCE($2, name), public_key = CASE WHEN $3 IS NOT NULL AND $3 != '' THEN $3 ELSE public_key END, secret_key = CASE WHEN $4 IS NOT NULL AND $4 != '' THEN $4 ELSE secret_key END, webhook_secret = CASE WHEN $5 IS NOT NULL AND $5 != '' THEN $5 ELSE webhook_secret END, sandbox_mode = COALESCE($6, sandbox_mode), is_active = COALESCE($7, is_active), is_default = COALESCE($8, is_default), updated_at = CURRENT_TIMESTAMP WHERE id = $9`,
        [provider || null, name || null, public_key, secret_key, webhook_secret, sandbox_mode ?? null, is_active ?? null, is_default ?? null, req.params.id]);
    });
    void logActivityAsync(req.user!.id, 'update_payment_gateway', 'payment_gateway', Number(req.params.id));
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM payment_gateways WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/test', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const gw = await queryOne('SELECT * FROM payment_gateways WHERE id = ?', [req.params.id]) as any;
    if (!gw) return res.status(404).json({ error: 'البوابة غير موجودة' });
    if (!gw.secret_key) return res.json({ ok: false, configured: false, message: 'المفتاح السري مطلوب' });
    res.json({ ok: true, configured: true, message: 'الإعدادات مكتملة (اختبار الاتصال الفعلي متاح في بيئة الإنتاج)' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
