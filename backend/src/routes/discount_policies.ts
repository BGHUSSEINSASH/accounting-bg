import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const policies = db.prepare(`SELECT dp.*, cc.name as classification_name FROM discount_policies dp LEFT JOIN client_classifications cc ON dp.client_classification_id = cc.id WHERE dp.is_active = 1 ORDER BY dp.discount_percentage DESC`).all();
    res.json(policies);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { name, policy_type, client_classification_id, min_quantity, min_total, discount_percentage, start_date, end_date, applies_to } = req.body;
    if (!name || !discount_percentage) return res.status(400).json({ error: 'الاسم ونسبة الخصم مطلوبان' });
    const result = db.prepare(`INSERT INTO discount_policies (name, policy_type, client_classification_id, min_quantity, min_total, discount_percentage, start_date, end_date, applies_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(name, policy_type || 'total', client_classification_id || null, min_quantity || 0, min_total || 0, discount_percentage, start_date || null, end_date || null, applies_to || 'all');
    res.json({ message: 'تم الحفظ', id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { name, discount_percentage, min_quantity, min_total, start_date, end_date, is_active } = req.body;
    db.prepare('UPDATE discount_policies SET name=COALESCE(?,name), discount_percentage=COALESCE(?,discount_percentage), min_quantity=COALESCE(?,min_quantity), min_total=COALESCE(?,min_total), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), is_active=COALESCE(?,is_active) WHERE id=?').run(name, discount_percentage, min_quantity, min_total, start_date, end_date, is_active, req.params.id);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE discount_policies SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// احتساب الخصم المناسب لعملية بيع
router.post('/calculate', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { client_id, total, items } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const client = client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id) as any : null;
    const classId = client?.classification_id;

    const policies = db.prepare(`SELECT * FROM discount_policies WHERE is_active = 1
      AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)
      AND (client_classification_id IS NULL OR client_classification_id = ?)
      ORDER BY discount_percentage DESC`).all(today, today, classId || null) as any[];

    let bestDiscount = 0;
    for (const policy of policies) {
      if (policy.policy_type === 'total' && total >= policy.min_total) bestDiscount = Math.max(bestDiscount, policy.discount_percentage);
      if (policy.policy_type === 'client_type' && classId && classId === policy.client_classification_id) bestDiscount = Math.max(bestDiscount, policy.discount_percentage);
      if (policy.policy_type === 'period') bestDiscount = Math.max(bestDiscount, policy.discount_percentage);
    }

    res.json({ discount_percentage: bestDiscount, discount_amount: total * (bestDiscount / 100) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
