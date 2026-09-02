import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month, user_id } = req.query;
    const currentDate = new Date();
    const y = year ? parseInt(year as string) : currentDate.getFullYear();
    const m = month ? parseInt(month as string) : currentDate.getMonth() + 1;
    let sql = `
      SELECT st.*, u.full_name, u.department,
        COALESCE((SELECT SUM(si.total) FROM sales_invoices si WHERE si.sales_rep_id = st.user_id AND EXTRACT(YEAR FROM si.invoice_date) = st.year AND (st.period_type != 'monthly' OR EXTRACT(MONTH FROM si.invoice_date) = st.month)), 0) as actual_amount,
        COALESCE((SELECT COUNT(*) FROM sales_invoices si WHERE si.sales_rep_id = st.user_id AND EXTRACT(YEAR FROM si.invoice_date) = st.year AND (st.period_type != 'monthly' OR EXTRACT(MONTH FROM si.invoice_date) = st.month)), 0) as actual_count
      FROM sales_targets st
      JOIN users u ON st.user_id = u.id
      WHERE st.year = ?`;
    const params: any[] = [y];
    if (m) { sql += " AND (st.month = ? OR st.period_type != 'monthly')"; params.push(m); }
    if (user_id) { sql += ' AND st.user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY u.full_name';
    const targets = await query(sql, params);
    res.json(targets);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query;
    const y = year || new Date().getFullYear();
    const m = month || (new Date().getMonth() + 1);
    const summary = await query(`
      SELECT u.id, u.full_name, u.department,
        COALESCE(st.target_amount, 0) as target_amount,
        COALESCE(SUM(si.total), 0) as achieved_amount,
        COUNT(si.id) as invoice_count,
        CASE WHEN COALESCE(st.target_amount, 0) > 0 THEN ROUND(COALESCE(SUM(si.total), 0) * 100.0 / st.target_amount, 1) ELSE 0 END as achievement_pct
      FROM users u
      LEFT JOIN sales_targets st ON st.user_id = u.id AND st.year = ? AND st.month = ? AND st.period_type = 'monthly'
      LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id AND EXTRACT(YEAR FROM si.invoice_date) = ? AND EXTRACT(MONTH FROM si.invoice_date) = ?
      WHERE u.is_active = 1
      GROUP BY u.id, u.full_name, u.department, st.target_amount
      ORDER BY achieved_amount DESC
    `, [y, m, y, m]);
    res.json(summary);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, period_type, month, quarter, year, target_amount, target_count, notes } = req.body;
    if (!user_id || !year || !target_amount) return res.status(400).json({ error: 'بيانات ناقصة' });
    await execute(`INSERT INTO sales_targets (user_id, period_type, month, quarter, year, target_amount, target_count, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, period_type, month, quarter, year) DO UPDATE SET target_amount = EXCLUDED.target_amount, target_count = EXCLUDED.target_count, notes = EXCLUDED.notes`,
      [user_id, period_type || 'monthly', month || null, quarter || null, year, target_amount, target_count || 0, notes || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'set_sales_target', 'sales_target');
    res.json({ message: 'تم حفظ الهدف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM sales_targets WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/commissions/rules', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await query(`SELECT cr.*, u.full_name FROM commission_rules cr LEFT JOIN users u ON cr.user_id = u.id WHERE cr.is_active = 1`);
    res.json(rules);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/commissions/rules', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, rule_type, percentage, fixed_amount, min_sales, max_sales } = req.body;
    const result = await execute(`INSERT INTO commission_rules (user_id, rule_type, percentage, fixed_amount, min_sales, max_sales) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id || null, rule_type || 'percentage', percentage || 0, fixed_amount || 0, min_sales || 0, max_sales || null]);
    res.json({ message: 'تم الحفظ', id: result.id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/commissions', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, user_id } = req.query;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();
    let sql = `SELECT c.*, u.full_name FROM commissions c JOIN users u ON c.user_id = u.id WHERE c.month = ? AND c.year = ?`;
    const params: any[] = [m, y];
    if (user_id) { sql += ' AND c.user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY c.created_at DESC';
    const commissions = await query(sql, params);
    res.json(commissions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/commissions/calculate', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.body;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();
    const reps = await query("SELECT id FROM users WHERE is_active = 1 AND role = 'sales_rep'") as any[];
    const defaultRule = await queryOne("SELECT * FROM commission_rules WHERE user_id IS NULL AND is_active = 1 LIMIT 1") as any;
    let count = 0;
    for (const rep of reps) {
      const rule = (await queryOne("SELECT * FROM commission_rules WHERE user_id = ? AND is_active = 1 LIMIT 1", [rep.id]) as any) || defaultRule;
      if (!rule) continue;
      const salesRow = await queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE sales_rep_id = ? AND EXTRACT(MONTH FROM invoice_date) = ? AND EXTRACT(YEAR FROM invoice_date) = ?`, [rep.id, m, y]) as any;
      const sales = salesRow?.total || 0;
      if (sales === 0) continue;
      let commission = 0;
      if (rule.rule_type === 'percentage') commission = sales * (rule.percentage / 100);
      else if (rule.rule_type === 'fixed') commission = rule.fixed_amount;
      const existing = await queryOne('SELECT id FROM commissions WHERE user_id = ? AND month = ? AND year = ?', [rep.id, m, y]);
      if (!existing) {
        await execute('INSERT INTO commissions (user_id, amount, percentage, month, year) VALUES (?, ?, ?, ?, ?)', [rep.id, commission, rule.percentage || 0, m, y]);
        count++;
      }
    }
    res.json({ message: `تم احتساب ${count} عمولة`, month: m, year: y });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
