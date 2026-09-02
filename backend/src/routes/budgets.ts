import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, fiscal_year } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = 'SELECT b.*, u.full_name as created_by_name FROM budgets b LEFT JOIN users u ON b.created_by = u.id WHERE 1=1';
    const params: any[] = [];
    if (fiscal_year) { sql += ' AND b.fiscal_year = ?'; params.push(fiscal_year); }
    const countRow = await queryOne(sql.replace('b.*, u.full_name as created_by_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const budgets = await query(sql, params);
    res.json({ budgets, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/items/:itemId', async (req: AuthRequest, res: Response) => {
  // placeholder - handled via /:id/items
  res.status(404).json({ error: 'Not found' });
});

router.delete('/items/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM budget_items WHERE id = ?', [req.params.itemId]);
    void logActivityAsync(req.user!.id, 'delete_budget_item', 'budget_item', parseInt(req.params.itemId));
    res.json({ message: 'Budget item deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/report', async (req: AuthRequest, res: Response) => {
  try {
    const budget = await queryOne('SELECT * FROM budgets WHERE id = ?', [req.params.id]) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const items = await query('SELECT bi.*, a.code as account_code, a.name as account_name, a.balance as actual_amount FROM budget_items bi JOIN accounts a ON bi.account_id = a.id WHERE bi.budget_id = ?', [req.params.id]) as any[];
    const report = items.map((item: any) => {
      const budget_amount = item.amount;
      const actual_amount = item.actual_amount || 0;
      const variance = actual_amount - budget_amount;
      const variance_percentage = budget_amount !== 0 ? Math.round((variance / budget_amount) * 10000) / 100 : 0;
      return { account_name: item.account_name, account_code: item.account_code, budget_amount, actual_amount, variance, variance_percentage };
    });
    res.json({ budget: { id: budget.id, name: budget.name, fiscal_year: budget.fiscal_year }, report });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const budget = await queryOne('SELECT b.*, u.full_name as created_by_name FROM budgets b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?', [req.params.id]) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    budget.items = await query('SELECT bi.*, a.code as account_code, a.name as account_name FROM budget_items bi JOIN accounts a ON bi.account_id = a.id WHERE bi.budget_id = ? ORDER BY bi.period', [req.params.id]);
    res.json(budget);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, fiscal_year, period_type } = req.body;
    const result = await execute('INSERT INTO budgets (name, fiscal_year, period_type, created_by) VALUES (?, ?, ?, ?)',
      [name, fiscal_year, period_type || 'monthly', req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_budget', 'budget', result.id as number);
    res.json({ message: 'Budget created', id: result.id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, period_type, is_active } = req.body;
    await execute('UPDATE budgets SET name = COALESCE(?, name), period_type = COALESCE(?, period_type), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, period_type, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_budget', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM budget_items WHERE budget_id = ?', [req.params.id]);
    await execute('DELETE FROM budgets WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_budget', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { account_id, period, amount } = req.body;
    const budget = await queryOne('SELECT * FROM budgets WHERE id = ?', [req.params.id]) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const existing = await queryOne('SELECT id FROM budget_items WHERE budget_id = ? AND account_id = ? AND period = ?', [req.params.id, account_id, period]) as any;
    if (existing) {
      await execute('UPDATE budget_items SET amount = ? WHERE id = ?', [amount, existing.id]);
    } else {
      await execute('INSERT INTO budget_items (budget_id, account_id, period, amount) VALUES (?, ?, ?, ?)', [req.params.id, account_id, period, amount]);
    }
    void logActivityAsync(req.user!.id, 'add_budget_item', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget item saved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { new_fiscal_year, new_name } = req.body;
    const original = await queryOne('SELECT * FROM budgets WHERE id = ?', [req.params.id]) as any;
    if (!original) return res.status(404).json({ error: 'Budget not found' });
    const newId = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO budgets (name, fiscal_year, period_type, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
        [new_name || `${original.name} (${new_fiscal_year})`, new_fiscal_year, original.period_type, req.user!.id]);
      const bid = result.rows[0].id;
      const items = await client.query('SELECT account_id, period, amount FROM budget_items WHERE budget_id = $1', [req.params.id]).then(r => r.rows);
      for (const item of items as any[]) {
        await client.query('INSERT INTO budget_items (budget_id, account_id, period, amount) VALUES ($1,$2,$3,$4)', [bid, item.account_id, item.period, item.amount]);
      }
      return bid;
    });
    void logActivityAsync(req.user!.id, 'duplicate_budget', 'budget', newId as number);
    res.json({ message: 'Budget duplicated', id: newId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
