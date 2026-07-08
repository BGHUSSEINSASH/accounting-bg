import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/company', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const info = db.prepare('SELECT * FROM company_info LIMIT 1').get() || {};
    res.json(info);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/company', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM company_info LIMIT 1').get() as { id: number } | undefined;
    const { name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number } = req.body;

    if (existing) {
      db.prepare("UPDATE company_info SET name=COALESCE(?,name), name_en=COALESCE(?,name_en), logo=COALESCE(?,logo), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), website=COALESCE(?,website), tax_number=COALESCE(?,tax_number), commercial_registry=COALESCE(?,commercial_registry), cr_number=COALESCE(?,cr_number) WHERE id=?")
        .run(name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number, existing.id);
    } else {
      db.prepare('INSERT INTO company_info (name, name_en, logo, address, phone, email, website, tax_number, commercial_registry, cr_number) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(name || '', name_en || '', logo || '', address || '', phone || '', email || '', website || '', tax_number || '', commercial_registry || '', cr_number || '');
    }
    logActivity(req.user!.id, 'update_company', 'settings', undefined, 'تحديث معلومات الشركة');
    res.json({ message: 'Company info updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT setting_key, setting_value FROM settings').all() as { setting_key: string; setting_value: string }[];
    const settings: Record<string, string> = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const upsert = db.prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP");
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(req.body)) {
        upsert.run(key, String(value));
      }
    });
    tx();
    logActivity(req.user!.id, 'update_settings', 'settings', undefined, 'تحديث الإعدادات');
    res.json({ message: 'Settings updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/currencies', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const currencies = db.prepare("SELECT * FROM currencies WHERE is_active = 1 ORDER BY is_base DESC, code").all();
    res.json(currencies);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/currencies', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, exchange_rate, is_base } = req.body;
    const db = getDatabase();
    const trx = db.transaction(() => {
      if (is_base) {
        db.prepare("UPDATE currencies SET is_base = 0").run();
      }
      const result = db.prepare("INSERT INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES (?, ?, ?, ?, ?)")
        .run(code, name, symbol, exchange_rate || 1, is_base ? 1 : 0);
      return result.lastInsertRowid;
    });
    const id = trx();
    logActivity(req.user!.id, 'create_currency', 'settings', id as number, 'إضافة عملة جديدة');
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/currencies/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, exchange_rate, is_base, is_active } = req.body;
    const db = getDatabase();
    const trx = db.transaction(() => {
      if (is_base) {
        db.prepare("UPDATE currencies SET is_base = 0").run();
      }
      db.prepare("UPDATE currencies SET code=COALESCE(?,code), name=COALESCE(?,name), symbol=COALESCE(?,symbol), exchange_rate=COALESCE(?,exchange_rate), is_base=COALESCE(?,is_base), is_active=COALESCE(?,is_active) WHERE id=?")
        .run(code, name, symbol, exchange_rate, is_base !== undefined ? (is_base ? 1 : 0) : undefined, is_active !== undefined ? (is_active ? 1 : 0) : undefined, req.params.id);
    });
    trx();
    logActivity(req.user!.id, 'update_currency', 'settings', parseInt(req.params.id), 'تحديث العملة');
    res.json({ message: 'Currency updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/currencies/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare("UPDATE currencies SET is_active = 0 WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, 'delete_currency', 'settings', parseInt(req.params.id), 'حذف العملة');
    res.json({ message: 'Currency deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
