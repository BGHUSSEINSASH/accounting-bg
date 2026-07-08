import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

// جلب الأهداف مع الإنجاز الفعلي
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { year, month, user_id } = req.query;
    const currentDate = new Date();
    const y = year ? parseInt(year as string) : currentDate.getFullYear();
    const m = month ? parseInt(month as string) : currentDate.getMonth() + 1;

    let query = `
      SELECT st.*, u.full_name, u.department,
        COALESCE((
          SELECT SUM(si.total) FROM sales_invoices si
          WHERE si.sales_rep_id = st.user_id
          AND CAST(strftime('%Y', si.invoice_date) AS INTEGER) = st.year
          AND (st.period_type != 'monthly' OR CAST(strftime('%m', si.invoice_date) AS INTEGER) = st.month)
        ), 0) as actual_amount,
        COALESCE((
          SELECT COUNT(*) FROM sales_invoices si
          WHERE si.sales_rep_id = st.user_id
          AND CAST(strftime('%Y', si.invoice_date) AS INTEGER) = st.year
          AND (st.period_type != 'monthly' OR CAST(strftime('%m', si.invoice_date) AS INTEGER) = st.month)
        ), 0) as actual_count
      FROM sales_targets st
      JOIN users u ON st.user_id = u.id
      WHERE st.year = ?`;
    const params: any[] = [y];
    if (m) { query += " AND (st.month = ? OR st.period_type != 'monthly')"; params.push(m); }
    if (user_id) { query += ' AND st.user_id = ?'; params.push(user_id); }
    query += ' ORDER BY u.full_name';

    const targets = db.prepare(query).all(...params);
    res.json(targets);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ملخص الأداء لكل مندوب
router.get('/summary', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { year, month } = req.query;
    const y = year || new Date().getFullYear();
    const m = month || (new Date().getMonth() + 1);

    const summary = db.prepare(`
      SELECT u.id, u.full_name, u.department,
        COALESCE(st.target_amount, 0) as target_amount,
        COALESCE(SUM(si.total), 0) as achieved_amount,
        COUNT(si.id) as invoice_count,
        CASE WHEN COALESCE(st.target_amount, 0) > 0
          THEN ROUND(COALESCE(SUM(si.total), 0) * 100.0 / st.target_amount, 1)
          ELSE 0 END as achievement_pct
      FROM users u
      LEFT JOIN sales_targets st ON st.user_id = u.id AND st.year = ? AND st.month = ? AND st.period_type = 'monthly'
      LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id
        AND strftime('%Y', si.invoice_date) = CAST(? AS TEXT)
        AND strftime('%m', si.invoice_date) = printf('%02d', CAST(? AS INTEGER))
      WHERE u.is_active = 1
      GROUP BY u.id
      ORDER BY achieved_amount DESC
    `).all(y, m, y, m);

    res.json(summary);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// إضافة / تحديث هدف
router.post('/', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id, period_type, month, quarter, year, target_amount, target_count, notes } = req.body;
    if (!user_id || !year || !target_amount) return res.status(400).json({ error: 'بيانات ناقصة' });

    db.prepare(`
      INSERT INTO sales_targets (user_id, period_type, month, quarter, year, target_amount, target_count, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, period_type, month, quarter, year) DO UPDATE SET
        target_amount = excluded.target_amount,
        target_count = excluded.target_count,
        notes = excluded.notes
    `).run(user_id, period_type || 'monthly', month || null, quarter || null, year, target_amount, target_count || 0, notes || null, req.user!.id);

    logActivity(req.user!.id, 'set_sales_target', 'sales_target');
    res.json({ message: 'تم حفظ الهدف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM sales_targets WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// قواعد العمولات
router.get('/commissions/rules', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const rules = db.prepare(`
      SELECT cr.*, u.full_name FROM commission_rules cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.is_active = 1
    `).all();
    res.json(rules);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/commissions/rules', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id, rule_type, percentage, fixed_amount, min_sales, max_sales } = req.body;
    const result = db.prepare(`
      INSERT INTO commission_rules (user_id, rule_type, percentage, fixed_amount, min_sales, max_sales)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id || null, rule_type || 'percentage', percentage || 0, fixed_amount || 0, min_sales || 0, max_sales || null);
    res.json({ message: 'تم الحفظ', id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// احتساب وعرض العمولات
router.get('/commissions', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { month, year, user_id } = req.query;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();

    let query = `
      SELECT c.*, u.full_name FROM commissions c
      JOIN users u ON c.user_id = u.id
      WHERE c.month = ? AND c.year = ?`;
    const params: any[] = [m, y];
    if (user_id) { query += ' AND c.user_id = ?'; params.push(user_id); }
    query += ' ORDER BY c.created_at DESC';

    const commissions = db.prepare(query).all(...params);
    res.json(commissions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// توليد العمولات للشهر
router.post('/commissions/calculate', authorize('admin', 'accountant'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { month, year } = req.body;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();

    const reps = db.prepare("SELECT id FROM users WHERE is_active = 1 AND role = 'sales_rep'").all() as any[];
    const defaultRule = db.prepare("SELECT * FROM commission_rules WHERE user_id IS NULL AND is_active = 1 LIMIT 1").get() as any;

    const trx = db.transaction(() => {
      let count = 0;
      for (const rep of reps) {
        const rule = (db.prepare("SELECT * FROM commission_rules WHERE user_id = ? AND is_active = 1 LIMIT 1").get(rep.id) as any) || defaultRule;
        if (!rule) continue;

        const sales = (db.prepare(`
          SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices
          WHERE sales_rep_id = ? AND strftime('%m', invoice_date) = printf('%02d', ?) AND strftime('%Y', invoice_date) = CAST(? AS TEXT)
        `).get(rep.id, m, y) as any)?.total || 0;

        if (sales === 0) continue;

        let commission = 0;
        if (rule.rule_type === 'percentage') commission = sales * (rule.percentage / 100);
        else if (rule.rule_type === 'fixed') commission = rule.fixed_amount;

        const existing = db.prepare('SELECT id FROM commissions WHERE user_id = ? AND month = ? AND year = ?').get(rep.id, m, y);
        if (!existing) {
          db.prepare('INSERT INTO commissions (user_id, amount, percentage, month, year) VALUES (?, ?, ?, ?, ?)').run(rep.id, commission, rule.percentage || 0, m, y);
          count++;
        }
      }
      return count;
    });

    const c = trx();
    res.json({ message: `تم احتساب ${c} عمولة`, month: m, year: y });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
