import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = 'SELECT f.*, a.name as account_name FROM fixed_assets f LEFT JOIN accounts a ON f.account_id = a.id WHERE f.is_active = 1';
    const params: any[] = [];
    if (status) { sql += ' AND f.status = ?'; params.push(status); }
    if (category) { sql += ' AND f.category = ?'; params.push(category); }
    const countRow = await queryOne(sql.replace('f.*, a.name as account_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const assets = await query(sql, params);
    res.json({ assets, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/depreciation', async (req: AuthRequest, res: Response) => {
  try {
    const records = await query('SELECT * FROM asset_depreciation WHERE asset_id = ? ORDER BY depreciation_date DESC', [req.params.id]);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const asset = await queryOne('SELECT f.*, a.name as account_name FROM fixed_assets f LEFT JOIN accounts a ON f.account_id = a.id WHERE f.id = ?', [req.params.id]) as any;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    asset.depreciation_records = await query('SELECT * FROM asset_depreciation WHERE asset_id = ? ORDER BY depreciation_date ASC', [req.params.id]);
    res.json(asset);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, account_id } = req.body;
    const code = await generateCodeAsync('AST-', 'fixed_assets');
    await execute(`INSERT INTO fixed_assets (code, name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, current_book_value, accumulated_depreciation, location, notes, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, category || null, purchase_date || null, purchase_cost || 0, residual_value || 0, useful_life_years || 0, depreciation_method || 'straight_line', depreciation_rate || null, purchase_cost || 0, 0, location || null, notes || null, account_id || null]);
    void logActivityAsync(req.user!.id, 'create_fixed_asset', 'fixed_asset');
    res.json({ message: 'Fixed asset created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, status, account_id } = req.body;
    await execute(`UPDATE fixed_assets SET name = COALESCE(?, name), category = COALESCE(?, category), purchase_date = COALESCE(?, purchase_date), purchase_cost = COALESCE(?, purchase_cost), residual_value = COALESCE(?, residual_value), useful_life_years = COALESCE(?, useful_life_years), depreciation_method = COALESCE(?, depreciation_method), depreciation_rate = COALESCE(?, depreciation_rate), location = COALESCE(?, location), notes = COALESCE(?, notes), status = COALESCE(?, status), account_id = COALESCE(?, account_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, category, purchase_date, purchase_cost, residual_value, useful_life_years, depreciation_method, depreciation_rate, location, notes, status, account_id, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Fixed asset updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE fixed_assets SET is_active = 0 WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Fixed asset deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/depreciate', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.body;
    const asset = await queryOne('SELECT * FROM fixed_assets WHERE id = ? AND is_active = 1', [req.params.id]) as any;
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
    await withTransaction(async (client) => {
      await client.query('INSERT INTO asset_depreciation (asset_id, depreciation_date, amount) VALUES ($1,$2,$3)', [req.params.id, depreciation_date, amount]);
      await client.query('UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + $1, current_book_value = current_book_value - $1 WHERE id = $2', [amount, req.params.id]);
    });
    void logActivityAsync(req.user!.id, 'depreciate_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: 'Depreciation recorded', amount, depreciation_date });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/dispose', async (req: AuthRequest, res: Response) => {
  try {
    const { disposal_date, disposal_amount, status } = req.body;
    const asset = await queryOne('SELECT * FROM fixed_assets WHERE id = ? AND is_active = 1', [req.params.id]) as any;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    await execute('UPDATE fixed_assets SET status = ?, disposal_date = ?, disposal_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status || 'disposed', disposal_date || null, disposal_amount || 0, req.params.id]);
    void logActivityAsync(req.user!.id, 'dispose_fixed_asset', 'fixed_asset', parseInt(req.params.id));
    res.json({ message: `Asset ${status || 'disposed'}` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
