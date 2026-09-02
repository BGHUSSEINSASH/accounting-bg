import { Router, Response } from 'express';
import { query, queryOne, execute, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT aa.*, (SELECT COUNT(*) FROM journal_entry_items WHERE analytic_account_id = aa.id) as entry_count FROM analytical_accounts aa WHERE 1=1";
    const params: any[] = [];
    if (type) { sql += " AND aa.type = ?"; params.push(type); }
    const countRow = await queryOne(sql.replace('aa.*', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY aa.code ASC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const accounts = await query(sql, params);
    res.json({ accounts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/entries', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT je.entry_number, je.entry_date, je.description as entry_description, je.reference_type, jec.debit, jec.credit, jec.description as line_description FROM journal_entry_items jec JOIN journal_entries je ON jec.journal_entry_id = je.id WHERE jec.analytic_account_id = ?`;
    const params: any[] = [req.params.id];
    if (from) { sql += " AND je.entry_date >= ?"; params.push(from); }
    if (to) { sql += " AND je.entry_date <= ?"; params.push(to); }
    const countRow = await queryOne(`SELECT COUNT(*) as total FROM (${sql}) sub`, params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY je.entry_date DESC, je.id DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const entries = await query(sql, params) as any[];
    const totals = entries.reduce((acc: any, e: any) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 });
    res.json({ entries, totals, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/report', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const account = await queryOne("SELECT * FROM analytical_accounts WHERE id = ?", [req.params.id]) as any;
    if (!account) return res.status(404).json({ error: 'Analytical account not found' });
    let dateFilter = '';
    const params: any[] = [req.params.id];
    if (from) { dateFilter += ' AND je.entry_date >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND je.entry_date <= ?'; params.push(to); }
    const revenue = await queryOne(`SELECT COALESCE(SUM(jec.credit - jec.debit), 0) as net FROM journal_entry_items jec JOIN journal_entries je ON jec.journal_entry_id = je.id JOIN accounts a ON jec.account_id = a.id WHERE jec.analytic_account_id = ? AND a.type = 'income' ${dateFilter}`, params) as any;
    const expense = await queryOne(`SELECT COALESCE(SUM(jec.debit - jec.credit), 0) as net FROM journal_entry_items jec JOIN journal_entries je ON jec.journal_entry_id = je.id JOIN accounts a ON jec.account_id = a.id WHERE jec.analytic_account_id = ? AND a.type = 'expense' ${dateFilter}`, params) as any;
    const rev = revenue?.net || 0; const exp = expense?.net || 0;
    res.json({ account, revenue: rev, expense: exp, net_income: rev - exp, budget: account.budget_amount, budget_utilization: account.budget_amount > 0 ? (exp / account.budget_amount * 100) : 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const account = await queryOne("SELECT * FROM analytical_accounts WHERE id = ?", [req.params.id]) as any;
    if (!account) return res.status(404).json({ error: 'Analytical account not found' });
    res.json(account);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, type, parent_id, budget_amount, description } = req.body;
    const accountNumber = code || await generateCodeAsync('ANA', 'analytical_accounts', 'code');
    const result = await execute("INSERT INTO analytical_accounts (code, name, type, parent_id, budget_amount, description) VALUES (?, ?, ?, ?, ?, ?)",
      [accountNumber, name, type || 'project', parent_id || null, budget_amount || 0, description || null]);
    void logActivityAsync(req.user!.id, 'create_analytical_account', 'analytical_account', result.id as number);
    res.json({ message: 'Analytical account created', id: result.id, code: accountNumber });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, parent_id, budget_amount, description, is_active } = req.body;
    await execute("UPDATE analytical_accounts SET name = COALESCE(?, name), type = COALESCE(?, type), parent_id = COALESCE(?, parent_id), budget_amount = COALESCE(?, budget_amount), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?",
      [name, type, parent_id, budget_amount, description, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_analytical_account', 'analytical_account', parseInt(req.params.id));
    res.json({ message: 'Analytical account updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE analytical_accounts SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_analytical_account', 'analytical_account', parseInt(req.params.id));
    res.json({ message: 'Analytical account deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
