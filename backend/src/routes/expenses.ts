import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { upload } from '../middleware/upload';
import { syncSingleFile } from '../services/cloudSync';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from, to, category, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT e.*, u.full_name as paid_by_name, a.name as account_name FROM expenses e LEFT JOIN users u ON e.paid_by = u.id LEFT JOIN accounts a ON e.account_id = a.id WHERE 1=1";
    const params: any[] = [];
    if (from) { sql += ' AND e.expense_date >= ?'; params.push(from); }
    if (to) { sql += ' AND e.expense_date <= ?'; params.push(to); }
    if (category) { sql += ' AND e.category = ?'; params.push(category); }
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    const countRow = await queryOne(sql.replace('e.*, u.full_name as paid_by_name, a.name as account_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY e.expense_date DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const expenses = await query(sql, params);
    res.json({ expenses, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/categories', async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await query('SELECT DISTINCT category FROM expenses ORDER BY category');
    res.json(categories.map((c: any) => c.category));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/print', async (req: AuthRequest, res: Response) => {
  try {
    const expense = await queryOne("SELECT e.*, u.full_name as paid_by_name, a.name as account_name FROM expenses e LEFT JOIN users u ON e.paid_by = u.id LEFT JOIN accounts a ON e.account_id = a.id WHERE e.id = ?", [req.params.id]);
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(expense);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const expense = await queryOne("SELECT e.*, u.full_name as paid_by_name FROM expenses e LEFT JOIN users u ON e.paid_by = u.id WHERE e.id = ?", [req.params.id]);
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(expense);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const { expense_date, category, description, amount, account_id } = req.body;
    const receiptFile = req.file;
    const receiptPath = receiptFile ? `/uploads/${receiptFile.filename}` : null;
    await execute("INSERT INTO expenses (expense_date, category, description, amount, account_id, paid_by, receipt_image, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
      [expense_date || new Date().toISOString().split('T')[0], category || 'عام', description, amount, account_id || null, req.user!.id, receiptPath]);
    if (receiptFile) void syncSingleFile(receiptFile.path, 'uploads');
    void logActivityAsync(req.user!.id, 'create_expense', 'expense');
    res.json({ message: 'Expense recorded' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const { expense_date, category, description, amount, account_id } = req.body;
    const receiptFile = req.file;
    const receiptPath = receiptFile ? `/uploads/${receiptFile.filename}` : null;
    let sql = "UPDATE expenses SET expense_date = COALESCE(?, expense_date), category = COALESCE(?, category), description = COALESCE(?, description), amount = COALESCE(?, amount), account_id = COALESCE(?, account_id)";
    const params: any[] = [expense_date, category, description, amount, account_id];
    if (receiptPath) { sql += ", receipt_image = ?"; params.push(receiptPath); }
    sql += " WHERE id = ?";
    params.push(req.params.id);
    await execute(sql, params);
    if (receiptFile) void syncSingleFile(receiptFile.path, 'uploads');
    void logActivityAsync(req.user!.id, 'update_expense', 'expense', parseInt(req.params.id));
    res.json({ message: 'Expense updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const expense = await queryOne("SELECT * FROM expenses WHERE id = ?", [req.params.id]) as any;
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    await execute("UPDATE expenses SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.id, req.params.id]);
    void logActivityAsync(req.user!.id, 'approve_expense', 'expense', parseInt(req.params.id));
    res.json({ message: 'Expense approved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/reject', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const expense = await queryOne("SELECT * FROM expenses WHERE id = ?", [req.params.id]) as any;
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    const { rejection_reason } = req.body;
    await execute("UPDATE expenses SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rejection_reason || null, req.user!.id, req.params.id]);
    void logActivityAsync(req.user!.id, 'reject_expense', 'expense', parseInt(req.params.id));
    res.json({ message: 'Expense rejected' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
