import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { computeClientPrice } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/held-sales', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT hs.*, u.full_name as created_by_name FROM held_sales hs LEFT JOIN users u ON hs.created_by = u.id ORDER BY hs.created_at DESC LIMIT 100`);
    const items = rows.map((r: any) => ({ ...r, items: JSON.parse(r.items || '[]') }));
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/held-sales', authorize('admin', 'manager', 'accountant', 'sales_rep'), async (req: AuthRequest, res: Response) => {
  try {
    const { customer_name, items, discount = 0, tax = 0, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا يمكن تعليق عملية بدون أصناف' });
    const result = await execute('INSERT INTO held_sales (customer_name, items, discount, tax, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [customer_name || null, JSON.stringify(items), discount || 0, tax || 0, notes || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'hold_sale', 'held_sale', result.id as number);
    res.json({ message: 'تم تعليق البيع', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/held-sales/:id', async (req: AuthRequest, res: Response) => {
  try {
    const row = await queryOne('SELECT * FROM held_sales WHERE id = ?', [req.params.id]) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.items = JSON.parse(row.items || '[]');
    res.json(row);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/held-sales/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { customer_name, items, discount, tax, notes } = req.body;
    await execute('UPDATE held_sales SET customer_name = ?, items = ?, discount = ?, tax = ?, notes = ? WHERE id = ?',
      [customer_name || null, JSON.stringify(items || []), discount || 0, tax || 0, notes || null, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/held-sales/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM held_sales WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/recurring', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT rs.*, c.name as client_name FROM recurring_sales rs LEFT JOIN clients c ON rs.client_id = c.id ORDER BY rs.is_active DESC, rs.next_run_date ASC`);
    const items = rows.map((r: any) => ({ ...r, items: JSON.parse(r.items || '[]') }));
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/recurring', authorize('admin', 'manager', 'accountant', 'sales_rep'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, client_id, frequency, items, discount = 0, tax = 0, start_date, end_date } = req.body;
    if (!name || !frequency || !items || items.length === 0 || !start_date) return res.status(400).json({ error: 'البيانات غير مكتملة' });
    const result = await execute(`INSERT INTO recurring_sales (name, client_id, frequency, items, discount, tax, start_date, next_run_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, client_id || null, frequency, JSON.stringify(items), discount || 0, tax || 0, start_date, start_date, end_date || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_recurring_sale', 'recurring_sale', result.id as number);
    res.json({ message: 'تم إنشاء الاشتراك', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, client_id, frequency, items, discount, tax, start_date, next_run_date, end_date, is_active } = req.body;
    await execute(`UPDATE recurring_sales SET name = COALESCE(?, name), client_id = ?, frequency = COALESCE(?, frequency), items = ?, discount = COALESCE(?, discount), tax = COALESCE(?, tax), start_date = COALESCE(?, start_date), next_run_date = COALESCE(?, next_run_date), end_date = ?, is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, client_id || null, frequency, items ? JSON.stringify(items) : undefined, discount, tax, start_date, next_run_date, end_date || null, is_active, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM recurring_sales WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/recurring/run', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const due = await query("SELECT * FROM recurring_sales WHERE is_active = 1 AND next_run_date <= ? AND (end_date IS NULL OR end_date >= ?)", [today, today]) as any[];
    let created = 0;
    for (const plan of due) {
      const items = JSON.parse(plan.items || '[]');
      if (items.length === 0) continue;
      const invoiceNumber = await generateCodeAsync('INV', 'sales_invoices', 'invoice_number');
      let subtotal = 0;
      for (const it of items) {
        const itemData = await queryOne('SELECT * FROM items WHERE id = ?', [it.item_id]) as any;
        if (itemData) {
          if (itemData.current_quantity < (it.quantity || 0)) continue;
          subtotal += (it.quantity || 0) * (it.unit_price || 0);
        }
      }
      if (subtotal <= 0) continue;
      const discountAmount = subtotal * ((plan.discount || 0) / 100);
      const taxAmount = (subtotal - discountAmount) * ((plan.tax || 0) / 100);
      const total = subtotal - discountAmount + taxAmount;
      await withTransaction(async (client) => {
        const invResult = await client.query(`INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'unpaid',$10) RETURNING id`,
          [invoiceNumber, today, plan.client_id, req.user!.id, subtotal, discountAmount, taxAmount, total, total, req.user!.id]);
        const invoiceId = invResult.rows[0].id;
        for (const it of items) {
          await client.query('INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES ($1,$2,$3,$4,0,$5)',
            [invoiceId, it.item_id, it.quantity || 0, it.unit_price || 0, (it.quantity || 0) * (it.unit_price || 0)]);
          await client.query('UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2', [it.quantity || 0, it.item_id]);
        }
        if (plan.client_id) {
          await client.query('UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2', [total, plan.client_id]);
        }
        const next = new Date(plan.next_run_date);
        const freq = plan.frequency;
        if (freq === 'daily') next.setDate(next.getDate() + 1);
        else if (freq === 'weekly') next.setDate(next.getDate() + 7);
        else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
        else next.setFullYear(next.getFullYear() + 1);
        const nextStr = next.toISOString().split('T')[0];
        const shouldDeactivate = plan.end_date && nextStr > plan.end_date;
        await client.query("UPDATE recurring_sales SET next_run_date = $1, last_run_date = $2, is_active = CASE WHEN $3 THEN 0 ELSE is_active END WHERE id = $4",
          [nextStr, today, shouldDeactivate, plan.id]);
      });
      created++;
    }
    res.json({ message: 'تم إنشاء الفواتير المتكررة', created });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/visits', async (req: AuthRequest, res: Response) => {
  try {
    const { client_id } = req.query;
    let sql = `SELECT cv.*, c.name as client_name, c.phone as client_phone, u.full_name as created_by_name FROM client_visits cv LEFT JOIN clients c ON cv.client_id = c.id LEFT JOIN users u ON cv.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (client_id) { sql += ' AND cv.client_id = ?'; params.push(client_id); }
    sql += ' ORDER BY cv.visit_date DESC, cv.id DESC LIMIT 200';
    res.json(await query(sql, params));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/visits', authorize('admin', 'manager', 'sales_rep'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, visit_date, visit_type, purpose, notes, outcome, latitude, longitude } = req.body;
    if (!client_id) return res.status(400).json({ error: 'العميل مطلوب' });
    const result = await execute(`INSERT INTO client_visits (client_id, visit_date, visit_type, purpose, notes, outcome, latitude, longitude, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [client_id, visit_date || new Date().toISOString().split('T')[0], visit_type || 'visit', purpose || null, notes || null, outcome || null, latitude || null, longitude || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_client_visit', 'client_visit', result.id as number);
    res.json({ message: 'تم تسجيل الزيارة', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/visits/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM client_visits WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/complaints', async (req: AuthRequest, res: Response) => {
  try {
    const { status, type } = req.query;
    let sql = `SELECT co.*, c.name as client_name, c.phone as client_phone, si.invoice_number, u.full_name as created_by_name FROM complaints co LEFT JOIN clients c ON co.client_id = c.id LEFT JOIN sales_invoices si ON co.sales_invoice_id = si.id LEFT JOIN users u ON co.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ' AND co.status = ?'; params.push(status); }
    if (type) { sql += ' AND co.type = ?'; params.push(type); }
    sql += ' ORDER BY co.complaint_date DESC, co.id DESC';
    const rows = await query(sql, params) as any[];
    const data = rows.map((r) => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/complaints', authorize('admin', 'manager', 'sales_rep'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, sales_invoice_id, complaint_date, type, subject, description, items, refund_amount } = req.body;
    if (!type) return res.status(400).json({ error: 'النوع مطلوب' });
    const number = await generateCodeAsync('CMP', 'complaints', 'complaint_number');
    const result = await execute(`INSERT INTO complaints (complaint_number, client_id, sales_invoice_id, complaint_date, type, subject, description, items, refund_amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [number, client_id || null, sales_invoice_id || null, complaint_date || new Date().toISOString().split('T')[0], type, subject || null, description || null, items ? JSON.stringify(items) : null, refund_amount || 0, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_complaint', 'complaint', result.id as number);
    res.json({ message: 'تم تسجيل الشكوى', id: result.id, number });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/complaints/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status, resolution, type, subject, description, refund_amount } = req.body;
    await execute(`UPDATE complaints SET status = COALESCE(?, status), resolution = COALESCE(?, resolution), type = COALESCE(?, type), subject = COALESCE(?, subject), description = COALESCE(?, description), refund_amount = COALESCE(?, refund_amount) WHERE id = ?`,
      [status, resolution, type, subject, description, refund_amount, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_complaint', 'complaint', parseInt(req.params.id));
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/complaints/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM complaints WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/price/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, quantity = 1, loyalty_card_id } = req.query;
    const item = await queryOne('SELECT * FROM items WHERE id = ?', [req.params.itemId]) as any;
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    const original_price = item.selling_price || 0;
    let price = original_price;
    let loyalty_discount_percentage = 0;
    if (loyalty_card_id) {
      const card = await queryOne('SELECT * FROM loyalty_cards WHERE id = ?', [loyalty_card_id]) as any;
      if (card && card.is_active) {
        const today = new Date().toISOString().split('T')[0];
        if (!(card.start_date && card.start_date > today) && !(card.end_date && card.end_date < today)) {
          loyalty_discount_percentage = card.discount_percentage || 0;
          if (loyalty_discount_percentage > 0) price = price - (price * (loyalty_discount_percentage / 100));
        }
      }
    }
    res.json({ item_id: item.id, original_price, price: Math.round(price * 100) / 100, loyalty_discount_percentage, client_pricing_applied: false });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
