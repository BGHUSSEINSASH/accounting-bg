import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, fiscal_year } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = 'SELECT b.*, u.full_name as created_by_name FROM budgets b LEFT JOIN users u ON b.created_by = u.id WHERE 1=1';
    const params: any[] = [];
    if (fiscal_year) { query += ' AND b.fiscal_year = ?'; params.push(fiscal_year); }
    const total = (db.prepare(query.replace('b.*, u.full_name as created_by_name', 'COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const budgets = db.prepare(query).all(...params);
    res.json({ budgets, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const budget = db.prepare('SELECT b.*, u.full_name as created_by_name FROM budgets b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?').get(req.params.id) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    budget.items = db.prepare('SELECT bi.*, a.code as account_code, a.name as account_name FROM budget_items bi JOIN accounts a ON bi.account_id = a.id WHERE bi.budget_id = ? ORDER BY bi.period').all(req.params.id);
    res.json(budget);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, fiscal_year, period_type } = req.body;
    const db = getDatabase();
    const result = db.prepare('INSERT INTO budgets (name, fiscal_year, period_type, created_by) VALUES (?, ?, ?, ?)')
      .run(name, fiscal_year, period_type || 'monthly', req.user!.id);
    logActivity(req.user!.id, 'create_budget', 'budget', result.lastInsertRowid as number);
    res.json({ message: 'Budget created', id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, period_type, is_active } = req.body;
    const db = getDatabase();
    db.prepare('UPDATE budgets SET name = COALESCE(?, name), period_type = COALESCE(?, period_type), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, period_type, is_active, req.params.id);
    logActivity(req.user!.id, 'update_budget', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM budget_items WHERE budget_id = ?').run(req.params.id);
    db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'delete_budget', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/items', (req: AuthRequest, res: Response) => {
  try {
    const { account_id, period, amount } = req.body;
    const db = getDatabase();
    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const existing = db.prepare('SELECT id FROM budget_items WHERE budget_id = ? AND account_id = ? AND period = ?').get(req.params.id, account_id, period) as any;
    if (existing) {
      db.prepare('UPDATE budget_items SET amount = ? WHERE id = ?').run(amount, existing.id);
    } else {
      db.prepare('INSERT INTO budget_items (budget_id, account_id, period, amount) VALUES (?, ?, ?, ?)').run(req.params.id, account_id, period, amount);
    }
    logActivity(req.user!.id, 'add_budget_item', 'budget', parseInt(req.params.id));
    res.json({ message: 'Budget item saved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/items/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM budget_items WHERE id = ?').run(req.params.itemId);
    logActivity(req.user!.id, 'delete_budget_item', 'budget_item', parseInt(req.params.itemId));
    res.json({ message: 'Budget item deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/report', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id) as any;
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const items = db.prepare('SELECT bi.*, a.code as account_code, a.name as account_name, a.balance as actual_amount FROM budget_items bi JOIN accounts a ON bi.account_id = a.id WHERE bi.budget_id = ?').all(req.params.id) as any[];
    const report = items.map((item: any) => {
      const budget_amount = item.amount;
      const actual_amount = item.actual_amount || 0;
      const variance = actual_amount - budget_amount;
      const variance_percentage = budget_amount !== 0 ? Math.round((variance / budget_amount) * 10000) / 100 : 0;
      return {
        account_name: item.account_name,
        account_code: item.account_code,
        budget_amount,
        actual_amount,
        variance,
        variance_percentage
      };
    });
    res.json({ budget: { id: budget.id, name: budget.name, fiscal_year: budget.fiscal_year }, report });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/duplicate', (req: AuthRequest, res: Response) => {
  try {
    const { new_fiscal_year, new_name } = req.body;
    const db = getDatabase();
    const original = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id) as any;
    if (!original) return res.status(404).json({ error: 'Budget not found' });
    const trx = db.transaction(() => {
      const result = db.prepare('INSERT INTO budgets (name, fiscal_year, period_type, created_by) VALUES (?, ?, ?, ?)')
        .run(new_name || `${original.name} (${new_fiscal_year})`, new_fiscal_year, original.period_type, req.user!.id);
      const items = db.prepare('SELECT account_id, period, amount FROM budget_items WHERE budget_id = ?').all(req.params.id);
      const insertItem = db.prepare('INSERT INTO budget_items (budget_id, account_id, period, amount) VALUES (?, ?, ?, ?)');
      for (const item of items as any[]) {
        insertItem.run(result.lastInsertRowid, item.account_id, item.period, item.amount);
      }
      return result.lastInsertRowid;
    });
    const newId = trx();
    logActivity(req.user!.id, 'duplicate_budget', 'budget', newId as number);
    res.json({ message: 'Budget duplicated', id: newId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
