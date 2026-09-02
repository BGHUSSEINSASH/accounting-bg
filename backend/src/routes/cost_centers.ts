import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const centers = await query(`SELECT cc.*, p.name as parent_name FROM cost_centers cc LEFT JOIN cost_centers p ON cc.parent_id = p.id WHERE cc.is_active = 1 ORDER BY cc.code`);
    res.json(centers);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    const code = await generateCodeAsync('CC', 'cost_centers', 'code');
    const result = await execute('INSERT INTO cost_centers (code, name, parent_id) VALUES (?, ?, ?)', [code, name, parent_id || null]);
    res.json({ message: 'تم الإنشاء', id: result.id, code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, parent_id, is_active } = req.body;
    await execute('UPDATE cost_centers SET name=COALESCE(?,name), parent_id=COALESCE(?,parent_id), is_active=COALESCE(?,is_active) WHERE id=?', [name, parent_id, is_active, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE cost_centers SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/report', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const center = await queryOne('SELECT * FROM cost_centers WHERE id = ?', [req.params.id]);
    if (!center) return res.status(404).json({ error: 'Cost center not found' });
    let expQuery = 'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE cost_center_id = ?';
    const expParams: any[] = [req.params.id];
    if (from) { expQuery += ' AND expense_date >= ?'; expParams.push(from); }
    if (to) { expQuery += ' AND expense_date <= ?'; expParams.push(to); }
    const expRow = await queryOne(expQuery, expParams) as any;
    const expenses = expRow?.total || 0;
    let salesQuery = 'SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE cost_center_id = ?';
    const salesParams: any[] = [req.params.id];
    if (from) { salesQuery += ' AND invoice_date >= ?'; salesParams.push(from); }
    if (to) { salesQuery += ' AND invoice_date <= ?'; salesParams.push(to); }
    const salesRow = await queryOne(salesQuery, salesParams) as any;
    const sales = salesRow?.total || 0;
    res.json({ center, total_expenses: expenses, total_sales: sales, net: sales - expenses });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
