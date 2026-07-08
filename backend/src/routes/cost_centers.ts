import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const centers = db.prepare(`SELECT cc.*, p.name as parent_name FROM cost_centers cc LEFT JOIN cost_centers p ON cc.parent_id = p.id WHERE cc.is_active = 1 ORDER BY cc.code`).all();
    res.json(centers);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { name, parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    const code = generateCode('CC', 'cost_centers', 'code');
    const result = db.prepare('INSERT INTO cost_centers (code, name, parent_id) VALUES (?, ?, ?)').run(code, name, parent_id || null);
    res.json({ message: 'تم الإنشاء', id: result.lastInsertRowid, code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { name, parent_id, is_active } = req.body;
    db.prepare('UPDATE cost_centers SET name=COALESCE(?,name), parent_id=COALESCE(?,parent_id), is_active=COALESCE(?,is_active) WHERE id=?').run(name, parent_id, is_active, req.params.id);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE cost_centers SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// تقرير توزيع التكاليف على المراكز
router.get('/:id/report', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    const center = db.prepare('SELECT * FROM cost_centers WHERE id = ?').get(req.params.id);
    if (!center) return res.status(404).json({ error: 'Cost center not found' });

    let expQuery = 'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE cost_center_id = ?';
    const params: any[] = [req.params.id];
    if (from) { expQuery += ' AND expense_date >= ?'; params.push(from); }
    if (to) { expQuery += ' AND expense_date <= ?'; params.push(to); }
    const expenses = (db.prepare(expQuery).get(...params) as any)?.total || 0;

    let salesQuery = 'SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE cost_center_id = ?';
    const salesParams: any[] = [req.params.id];
    if (from) { salesQuery += ' AND invoice_date >= ?'; salesParams.push(from); }
    if (to) { salesQuery += ' AND invoice_date <= ?'; salesParams.push(to); }
    const sales = (db.prepare(salesQuery).get(...salesParams) as any)?.total || 0;

    res.json({ center, total_expenses: expenses, total_sales: sales, net: sales - expenses });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
