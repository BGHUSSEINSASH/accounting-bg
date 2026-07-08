import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status, category } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = 'SELECT f.*, a.name as account_name FROM fixed_assets f LEFT JOIN accounts a ON f.account_id = a.id WHERE f.is_active = 1';
    const params: any[] = [];
    if (status) { query += ' AND f.status = ?'; params.push(status); }
    if (category) { query += ' AND f.category = ?'; params.push(category); }
    const total = (db.prepare(query.replace('f.*, a.name as account_name', 'COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const assets = db.prepare(query).all(...params);
    res.json({ assets, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const asset = db.prepare('SELECT f.*, a.name as account_name FROM fixed_assets f LEFT JOIN accounts a ON f.account_id = a.id WHERE f.id = ?').get(req.params.id) as any;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    asset.depreciation_records = db.prepare('SELECT * FROM asset_depreciation WHERE asset_id = ? ORDER BY depreciation_date ASC').all(req.params.id);
    res.json(asset);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, account_id } = req.body;
    const db = getDatabase();
    const code = generateCode('AST-', 'fixed_assets');
    const current_book_value = purchase_cost;
    const accumulated_depreciation = 0;
    db.prepare(`INSERT INTO fixed_assets (code, name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, current_book_value, accumulated_depreciation, location, notes, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(code, name, category || null, purchase_date || null, purchase_cost || 0, residual_value || 0, useful_life_years || 0, depreciation_method || 'straight_line', depreciation_rate || null, current_book_value, accumulated_depreciation, location || null, notes || null, account_id || null);
    logActivity(req.user!.id, 'create_fixed_asset', 'fixed_asset');
    res.json({ message: 'Fixed asset created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, status, account_id } = req.body;
    const db = getDatabase();
    db.prepare(`UPDATE fixed_assets SET name = COALESCE(?, name), category = COALESCE(?, category), purchase_date = COALESCE(?, purchase_date), purchase_cost = COALESCE(?, purchase_cost), residual_value = COALESCE(?, residual_value), useful_life_years = COALESCE(?, useful_life_years), depreciation_method = COALESCE(?, depreciation_method), depreciation_rate = COALESCE(?, depreciation_rate), location = COALESCE(?, location), notes = COALESCE(?, notes), status = COALESCE(?, status), account_id = COALESCE(?, account_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, status, account_id, req.params.id);
    logActivity(req.user!.id, 'update_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Fixed asset updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE fixed_assets SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'delete_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Fixed asset deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/depreciate', (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.body;
    const db = getDatabase();
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ? AND is_active = 1').get(req.params.id) as any;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Cannot depreciate disposed or sold asset' });
    let amount = 0;
    if (asset.depreciation_method === 'straight_line') {
      amount = (asset.purchase_cost - asset.residual_value) / asset.useful_life_years / 12;
    } else {
      amount = asset.current_book_value * (1 / asset.useful_life_years * 2) / 12;
    }
    amount = Math.round(amount * 100) / 100;
    const depreciation_date = `${year}-${String(month).padStart(2, '0')}-01`;
    const trx = db.transaction(() => {
      db.prepare('INSERT INTO asset_depreciation (asset_id, depreciation_date, amount) VALUES (?, ?, ?)').run(req.params.id, depreciation_date, amount);
      db.prepare('UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + ?, current_book_value = current_book_value - ? WHERE id = ?').run(amount, amount, req.params.id);
    });
    trx();
    logActivity(req.user!.id, 'depreciate_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Depreciation recorded', amount, depreciation_date });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/depreciation', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const records = db.prepare('SELECT * FROM asset_depreciation WHERE asset_id = ? ORDER BY depreciation_date DESC').all(req.params.id);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/dispose', (req: AuthRequest, res: Response) => {
  try {
    const { disposal_date, disposal_amount, status } = req.body;
    const db = getDatabase();
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ? AND is_active = 1').get(req.params.id) as any;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    db.prepare('UPDATE fixed_assets SET status = ?, disposal_date = ?, disposal_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status || 'disposed', disposal_date || null, disposal_amount || 0, req.params.id);
    logActivity(req.user!.id, 'dispose_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: `Asset ${status || 'disposed'}` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
