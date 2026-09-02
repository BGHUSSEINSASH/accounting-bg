import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT pr.*, i.name as item_name, c.name as client_name FROM pricing_rules pr LEFT JOIN items i ON pr.item_id = i.id LEFT JOIN clients c ON pr.client_id = c.id ORDER BY pr.created_at DESC`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, rule_type, item_id, client_id, min_quantity, price_adjustment, adjustment_type, start_date, end_date } = req.body;
    if (!name || !rule_type) return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
    const result = await execute(`INSERT INTO pricing_rules (name, rule_type, item_id, client_id, min_quantity, price_adjustment, adjustment_type, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, rule_type, item_id || null, client_id || null, min_quantity || 0, price_adjustment || 0, adjustment_type || 'percentage', start_date || null, end_date || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_pricing_rule', 'pricing_rule', result.id as number);
    res.json({ message: 'تم إنشاء القاعدة', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, rule_type, item_id, client_id, min_quantity, price_adjustment, adjustment_type, start_date, end_date, is_active } = req.body;
    await execute(`UPDATE pricing_rules SET name = COALESCE(?, name), rule_type = COALESCE(?, rule_type), item_id = ?, client_id = ?, min_quantity = COALESCE(?, min_quantity), price_adjustment = COALESCE(?, price_adjustment), adjustment_type = COALESCE(?, adjustment_type), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, rule_type, item_id || null, client_id || null, min_quantity, price_adjustment, adjustment_type, start_date, end_date, is_active, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM pricing_rules WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/calculate/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, quantity = 1 } = req.query;
    const item = await queryOne('SELECT * FROM items WHERE id = ?', [req.params.itemId]) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    let price = item.selling_price;
    const today = new Date().toISOString().split('T')[0];
    const rules = await query(`SELECT * FROM pricing_rules WHERE is_active = 1 AND (item_id IS NULL OR item_id = ?) AND (client_id IS NULL OR client_id = ?) AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY id DESC`,
      [req.params.itemId, client_id || null, today, today]) as any[];
    for (const rule of rules) {
      if (rule.min_quantity && Number(quantity) < rule.min_quantity) continue;
      if (rule.adjustment_type === 'percentage') { price = price + (price * (rule.price_adjustment / 100)); }
      else { price = price + rule.price_adjustment; }
    }
    res.json({ item_id: item.id, original_price: item.selling_price, price: Math.round(price * 100) / 100, applied_rules: rules.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
