import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/company', async (_req: AuthRequest, res: Response) => {
  try {
    const info = await queryOne('SELECT * FROM company_info LIMIT 1') || {};
    res.json(info);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/company', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM company_info LIMIT 1') as { id: number } | undefined;
    const { name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number } = req.body;
    if (existing) {
      await execute("UPDATE company_info SET name=COALESCE(?,name), name_en=COALESCE(?,name_en), logo=COALESCE(?,logo), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), website=COALESCE(?,website), tax_number=COALESCE(?,tax_number), commercial_registry=COALESCE(?,commercial_registry), cr_number=COALESCE(?,cr_number) WHERE id=?",
        [name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number, existing.id]);
    } else {
      await execute('INSERT INTO company_info (name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [name || '', name_en || '', logo || '', address || '', phone || '', email || '', website || '', tax_number || '', commercial_registry || '', cr_number || '']);
    }
    void logActivityAsync(req.user!.id, 'update_company', 'settings', undefined, 'تحديث معلومات الشركة');
    res.json({ message: 'Company info updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM settings') as { setting_key: string; setting_value: string }[];
    const settings: Record<string, string> = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await withTransaction(async (client) => {
      for (const [key, value] of Object.entries(req.body)) {
        await client.query("INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value, updated_at=CURRENT_TIMESTAMP",
          [key, String(value)]);
      }
    });
    void logActivityAsync(req.user!.id, 'update_settings', 'settings', undefined, 'تحديث الإعدادات');
    res.json({ message: 'Settings updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/currencies', async (_req: AuthRequest, res: Response) => {
  try {
    const currencies = await query("SELECT * FROM currencies WHERE is_active = 1 ORDER BY is_base DESC, code");
    res.json(currencies);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/currencies', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, exchange_rate, is_base } = req.body;
    const id = await withTransaction(async (client) => {
      if (is_base) {
        await client.query("UPDATE currencies SET is_base = 0");
      }
      const result = await client.query("INSERT INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [code, name, symbol, exchange_rate || 1, is_base ? 1 : 0]);
      return result.rows[0].id;
    });
    void logActivityAsync(req.user!.id, 'create_currency', 'settings', id as number, 'إضافة عملة جديدة');
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/currencies/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, exchange_rate, is_base, is_active } = req.body;
    await withTransaction(async (client) => {
      if (is_base) {
        await client.query("UPDATE currencies SET is_base = 0");
      }
      await client.query("UPDATE currencies SET code=COALESCE($1,code), name=COALESCE($2,name), symbol=COALESCE($3,symbol), exchange_rate=COALESCE($4,exchange_rate), is_base=COALESCE($5,is_base), is_active=COALESCE($6,is_active) WHERE id=$7",
        [code, name, symbol, exchange_rate, is_base !== undefined ? (is_base ? 1 : 0) : undefined, is_active !== undefined ? (is_active ? 1 : 0) : undefined, req.params.id]);
    });
    void logActivityAsync(req.user!.id, 'update_currency', 'settings', parseInt(req.params.id), 'تحديث العملة');
    res.json({ message: 'Currency updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/currencies/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE currencies SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_currency', 'settings', parseInt(req.params.id), 'حذف العملة');
    res.json({ message: 'Currency deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
