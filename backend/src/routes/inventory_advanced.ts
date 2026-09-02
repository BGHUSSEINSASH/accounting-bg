import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { computeCostAmount, computeInventoryValue } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/bundles', async (req: AuthRequest, res: Response) => {
  try {
    const bundles = await query('SELECT * FROM bundles ORDER BY is_active DESC, name') as any[];
    const items = await query(`SELECT bi.*, i.name as item_name, i.code as item_code FROM bundle_items bi JOIN items i ON bi.item_id = i.id`);
    const data = bundles.map(b => ({ ...b, items: items.filter((i: any) => i.bundle_id === b.id) }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/bundles', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, selling_price, gift, items } = req.body;
    if (!name || !items || items.length === 0) return res.status(400).json({ error: 'الاسم والأصناف مطلوبة' });
    const code = await generateCodeAsync('BDL', 'bundles');
    const id = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO bundles (code, name, selling_price, gift, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [code, name, selling_price || 0, gift ? 1 : 0, req.user!.id]);
      const bundleId = result.rows[0].id;
      for (const it of items) await client.query('INSERT INTO bundle_items (bundle_id, item_id, quantity) VALUES ($1,$2,$3)', [bundleId, it.item_id, it.quantity || 1]);
      return bundleId;
    });
    void logActivityAsync(req.user!.id, 'create_bundle', 'bundle', id as number);
    res.json({ message: 'تم إنشاء المجموعة', id, code });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/bundles/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, selling_price, gift, is_active, items } = req.body;
    await withTransaction(async (client) => {
      await client.query('UPDATE bundles SET name = COALESCE($1, name), selling_price = COALESCE($2, selling_price), gift = $3, is_active = COALESCE($4, is_active) WHERE id = $5',
        [name, selling_price, gift ? 1 : 0, is_active, req.params.id]);
      if (items) {
        await client.query('DELETE FROM bundle_items WHERE bundle_id = $1', [req.params.id]);
        for (const it of items) await client.query('INSERT INTO bundle_items (bundle_id, item_id, quantity) VALUES ($1,$2,$3)', [req.params.id, it.item_id, it.quantity || 1]);
      }
    });
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/bundles/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM bundle_items WHERE bundle_id = ?', [req.params.id]);
    await execute('DELETE FROM bundles WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/disposals', async (req: AuthRequest, res: Response) => {
  try {
    const disposals = await query(`SELECT d.*, u.full_name as created_by_name FROM disposals d LEFT JOIN users u ON d.created_by = u.id ORDER BY d.disposal_date DESC, d.id DESC`) as any[];
    const items = await query(`SELECT di.*, i.name as item_name, i.code as item_code FROM disposal_items di JOIN items i ON di.item_id = i.id`);
    const data = disposals.map(d => ({ ...d, items: items.filter((i: any) => i.disposal_id === d.id) }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/disposals', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { disposal_date, type, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'يجب تحديد أصناف' });
    const number = await generateCodeAsync('DSP', 'disposals', 'disposal_number');
    const id = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO disposals (disposal_number, disposal_date, type, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [number, disposal_date || new Date().toISOString().split('T')[0], type || 'damaged', notes || null, req.user!.id]);
      const disposalId = result.rows[0].id;
      for (const it of items) {
        const item = await client.query('SELECT * FROM items WHERE id = $1', [it.item_id]).then(r => r.rows[0]);
        if (!item) throw new Error(`الصنف ${it.item_id} غير موجود`);
        if (item.current_quantity < it.quantity) throw new Error(`الكمية غير كافية للصنف ${item.name}`);
        await client.query('INSERT INTO disposal_items (disposal_id, item_id, quantity, reason) VALUES ($1,$2,$3,$4)', [disposalId, it.item_id, it.quantity, it.reason || null]);
        await client.query('UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2', [it.quantity, it.item_id]);
      }
      return disposalId;
    });
    void logActivityAsync(req.user!.id, 'create_disposal', 'disposal', id as number);
    res.json({ message: 'تم تسجيل الإتلاف', id, number });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/disposals/:id', async (req: AuthRequest, res: Response) => {
  try {
    const items = await query('SELECT * FROM disposal_items WHERE disposal_id = ?', [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const it of items) await client.query('UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2', [it.quantity, it.item_id]);
      await client.query('DELETE FROM disposal_items WHERE disposal_id = $1', [req.params.id]);
      await client.query('DELETE FROM disposals WHERE id = $1', [req.params.id]);
    });
    res.json({ message: 'تم الحذف واسترجاع الكميات' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/locations', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT wl.*, w.name as warehouse_name FROM warehouse_locations wl JOIN warehouses w ON wl.warehouse_id = w.id ORDER BY wl.warehouse_id, wl.name`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/locations', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { warehouse_id, name, code } = req.body;
    if (!warehouse_id || !name) return res.status(400).json({ error: 'المستودع والاسم مطلوبان' });
    const result = await execute('INSERT INTO warehouse_locations (warehouse_id, name, code) VALUES (?, ?, ?)', [warehouse_id, name, code || name]);
    res.json({ message: 'تمت الإضافة', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/locations/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM warehouse_locations WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/batches', async (req: AuthRequest, res: Response) => {
  try {
    const { item_id } = req.query;
    let sql = `SELECT ib.*, i.name as item_name, i.code as item_code, w.name as warehouse_name FROM item_batches ib JOIN items i ON ib.item_id = i.id LEFT JOIN warehouses w ON ib.warehouse_id = w.id WHERE 1=1`;
    const params: any[] = [];
    if (item_id) { sql += ' AND ib.item_id = ?'; params.push(item_id); }
    sql += ' ORDER BY ib.expiry_date ASC';
    res.json(await query(sql, params));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/batches', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, batch_number, quantity, expiry_date, purchase_price, warehouse_id } = req.body;
    if (!item_id || !batch_number) return res.status(400).json({ error: 'الصنف ورقم الدفعة مطلوبان' });
    await execute('INSERT INTO item_batches (item_id, batch_number, quantity, expiry_date, purchase_price, warehouse_id) VALUES (?, ?, ?, ?, ?, ?)',
      [item_id, batch_number, quantity || 0, expiry_date || null, purchase_price || 0, warehouse_id || null]);
    await execute('UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?', [quantity || 0, item_id]);
    res.json({ message: 'تمت إضافة الدفعة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/batches/:id', async (req: AuthRequest, res: Response) => {
  try {
    const batch = await queryOne('SELECT * FROM item_batches WHERE id = ?', [req.params.id]) as any;
    if (!batch) return res.status(404).json({ error: 'Not found' });
    await execute('UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?', [batch.quantity, batch.item_id]);
    await execute('DELETE FROM item_batches WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف واسترجاع الكمية' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/dead-stock', async (req: AuthRequest, res: Response) => {
  try {
    const days = Number(req.query.days || 60);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const items = await query(`
      SELECT i.*, COALESCE(SUM(sii.quantity), 0) as sold_quantity,
        (SELECT MAX(si.invoice_date) FROM sales_invoice_items x JOIN sales_invoices si ON si.id = x.sales_invoice_id WHERE x.item_id = i.id) as last_sold_date
      FROM items i
      LEFT JOIN sales_invoice_items sii ON sii.item_id = i.id
      GROUP BY i.id
      HAVING i.current_quantity > 0
        AND (last_sold_date IS NULL OR last_sold_date < $1)
      ORDER BY last_sold_date ASC NULLS FIRST
    `, [cutoff]);
    res.json({ items, days });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/reorder-suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const items = await query(`
      SELECT i.id, i.code, i.name, i.current_quantity, i.min_quantity, i.max_quantity,
        i.supplier_id, s.name as supplier_name, i.purchase_price
      FROM items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.is_active = 1
      ORDER BY (i.min_quantity - i.current_quantity) DESC
    `) as any[];
    const suggestions = items.filter(i => i.current_quantity < i.min_quantity).map(i => ({
      ...i,
      suggested_order_qty: Math.max(i.max_quantity - i.current_quantity, i.min_quantity - i.current_quantity),
      urgent: i.current_quantity === 0,
    }));
    res.json(suggestions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/costing/methods', async (req: AuthRequest, res: Response) => {
  try {
    const items = await query(`
      SELECT i.id, i.code, i.name, i.costing_method, i.average_cost, i.purchase_price, i.current_quantity,
        (SELECT COUNT(*) FROM item_batches ib WHERE ib.item_id = i.id) as batch_count
      FROM items i WHERE i.is_active = 1 ORDER BY i.name
    `) as any[];
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/costing/methods/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { costing_method, average_cost } = req.body;
    const valid = ['fifo', 'lifo', 'average'];
    if (costing_method && !valid.includes(costing_method)) return res.status(400).json({ error: 'طريقة تكلفة غير صالحة' });
    await execute('UPDATE items SET costing_method = COALESCE(?, costing_method), average_cost = COALESCE(?, average_cost) WHERE id = ?',
      [costing_method || null, average_cost != null ? average_cost : null, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_costing_method', 'item', parseInt(req.params.id));
    res.json({ message: 'تم تحديث طريقة التكلفة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/costing/valuation', async (req: AuthRequest, res: Response) => {
  try {
    const items = await query('SELECT id, code, name, current_quantity, costing_method, purchase_price, average_cost FROM items WHERE is_active = 1') as any[];
    const data = items.map(i => ({
      ...i,
      unit_cost: i.purchase_price || 0,
      inventory_value: (i.purchase_price || 0) * (i.current_quantity || 0),
    }));
    const total_value = data.reduce((s, d) => s + d.inventory_value, 0);
    const by_method = data.reduce((acc: Record<string, number>, d) => {
      const m = d.costing_method || 'fifo';
      acc[m] = (acc[m] || 0) + d.inventory_value;
      return acc;
    }, {});
    res.json({ items: data, total_value, by_method });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/costing/cogs', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, item_id } = req.query;
    let sql = `SELECT sii.item_id, i.name as item_name, i.costing_method, i.code as item_code, SUM(sii.quantity) as sold_quantity, SUM(sii.total) as revenue FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.sales_invoice_id JOIN items i ON i.id = sii.item_id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { sql += ' AND si.invoice_date <= ?'; params.push(to); }
    if (item_id) { sql += ' AND sii.item_id = ?'; params.push(item_id); }
    sql += ' GROUP BY sii.item_id, i.name, i.costing_method, i.code';
    const rows = await query(sql, params) as any[];
    const data = rows.map(r => {
      const cogs = (r.sold_quantity || 0) * (r.purchase_price || 0);
      return { ...r, cogs, gross_profit: r.revenue - cogs, margin_percent: r.revenue > 0 ? ((r.revenue - cogs) / r.revenue) * 100 : 0 };
    });
    const total_revenue = data.reduce((s, d) => s + d.revenue, 0);
    const total_cogs = data.reduce((s, d) => s + d.cogs, 0);
    res.json({ items: data, total_revenue, total_cogs, gross_profit: total_revenue - total_cogs });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
