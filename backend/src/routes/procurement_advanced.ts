import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

export function amountInWordsAR(amount: number, currencyName = 'ريال', fractionName = 'هللة'): string {
  return `${Math.floor(amount)} ${currencyName}`;
}

router.get('/rfqs', async (req: AuthRequest, res: Response) => {
  try {
    const rfqs = await query(`SELECT rfq.*, (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfq_id = rfq.id) as quotes_count, (SELECT COUNT(*) FROM rfq_items i WHERE i.rfq_id = rfq.id) as items_count, u.username as created_by_name FROM rfqs rfq LEFT JOIN users u ON rfq.created_by = u.id ORDER BY rfq.created_at DESC`) as any[];
    const items = await query(`SELECT ri.*, i.name as item_name FROM rfq_items ri JOIN items i ON ri.item_id = i.id`);
    const data = rfqs.map((r: any) => ({ ...r, items: items.filter((i: any) => i.rfq_id === r.id) }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/rfqs', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { rfq_date, deadline, supplier_ids, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'يجب إضافة صنف واحد على الأقل' });
    const rfqNumber = await generateCodeAsync('RFQ-', 'rfqs', 'rfq_number');
    const id = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO rfqs (rfq_number, rfq_date, deadline, supplier_ids, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [rfqNumber, rfq_date, deadline || null, supplier_ids ? JSON.stringify(supplier_ids) : null, notes || null, req.user!.id]);
      const rid = result.rows[0].id;
      for (const it of items) await client.query('INSERT INTO rfq_items (rfq_id, item_id, quantity, expected_price) VALUES ($1,$2,$3,$4)', [rid, it.item_id, it.quantity, it.expected_price || null]);
      return rid;
    });
    void logActivityAsync(req.user!.id, 'create_rfq', 'rfq', id as number);
    res.json({ message: 'تم إنشاء طلب العرض', id, rfq_number: rfqNumber });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/rfqs/:id/quotes', async (req: AuthRequest, res: Response) => {
  try {
    const quotes = await query(`SELECT q.*, s.name as supplier_name, (SELECT COUNT(*) FROM rfq_quote_items qi WHERE qi.quote_id = q.id) as items_count FROM rfq_quotes q LEFT JOIN suppliers s ON q.supplier_id = s.id WHERE q.rfq_id = ? ORDER BY q.total ASC`, [req.params.id]) as any[];
    const quoteItems = await query(`SELECT qi.*, i.name as item_name FROM rfq_quote_items qi JOIN items i ON qi.item_id = i.id WHERE qi.quote_id IN (SELECT id FROM rfq_quotes WHERE rfq_id = ?)`, [req.params.id]);
    const data = quotes.map((q: any) => ({ ...q, items: quoteItems.filter((i: any) => i.quote_id === q.id) }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/rfqs/:id/quotes', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, quote_date, notes, items } = req.body;
    if (!supplier_id || !items || items.length === 0) return res.status(400).json({ error: 'المورد والبنود مطلوبة' });
    const id = await withTransaction(async (client) => {
      let total = 0;
      for (const it of items) total += it.quantity * it.unit_price;
      const result = await client.query('INSERT INTO rfq_quotes (rfq_id, supplier_id, quote_date, notes, total) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [req.params.id, supplier_id, quote_date, notes || null, total]);
      const qid = result.rows[0].id;
      for (const it of items) await client.query('INSERT INTO rfq_quote_items (quote_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)', [qid, it.item_id, it.quantity, it.unit_price, it.quantity * it.unit_price]);
      return qid;
    });
    await execute("UPDATE rfqs SET status = 'quoted' WHERE id = ? AND status = 'open'", [req.params.id]);
    void logActivityAsync(req.user!.id, 'create_rfq_quote', 'rfq_quote', id as number);
    res.json({ message: 'تم تسجيل العرض', id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/rfqs/:id/award', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { quote_id } = req.body;
    await execute('UPDATE rfq_quotes SET is_selected = 0 WHERE rfq_id = ?', [req.params.id]);
    await execute('UPDATE rfq_quotes SET is_selected = 1 WHERE id = ?', [quote_id]);
    await execute("UPDATE rfqs SET status = 'awarded' WHERE id = ?", [req.params.id]);
    res.json({ message: 'تم ترسية العرض' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/rfqs/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM rfqs WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/checks', async (req: AuthRequest, res: Response) => {
  try {
    const { direction, status } = req.query;
    let sql = 'SELECT * FROM checks_register WHERE 1=1';
    const params: any[] = [];
    if (direction) { sql += ' AND direction = ?'; params.push(direction); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY check_date DESC';
    res.json(await query(sql, params));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/checks', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { check_number, direction, bank_name, amount, check_date, due_date, status, party_name, notes } = req.body;
    if (!check_number || !direction || !amount) return res.status(400).json({ error: 'رقم الشيك والاتجاه والمبلغ مطلوبة' });
    const result = await execute('INSERT INTO checks_register (check_number, direction, bank_name, amount, check_date, due_date, status, party_name, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [check_number, direction, bank_name || null, amount, check_date, due_date || null, status || 'pending', party_name || null, notes || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_check', 'check', result.id as number);
    res.json({ message: 'تم تسجيل الشيك', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/checks/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'deposited', 'cleared', 'bounced', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    await execute('UPDATE checks_register SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'تم تحديث الحالة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/checks/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM checks_register WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/checks/:id/print', async (req: AuthRequest, res: Response) => {
  try {
    const cheque = await queryOne('SELECT * FROM checks_register WHERE id = ?', [req.params.id]) as any;
    if (!cheque) return res.status(404).json({ error: 'الشيك غير موجود' });
    const company = (await queryOne('SELECT * FROM company_info LIMIT 1') as any) || {};
    const currencyRow = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'base_currency'") as any;
    const currency = currencyRow?.setting_value || 'IQD';
    void logActivityAsync(req.user!.id, 'print_check', 'check', cheque.id);
    res.json({ cheque: { ...cheque, check_date_display: cheque.check_date, due_date_display: cheque.due_date || null }, company: { name: company.name || '', name_en: company.name_en || '', address: company.address || '', phone: company.phone || '', tax_number: company.tax_number || '', commercial_registry: company.commercial_registry || '', city: company.city || '' }, currency, amount_words: amountInWordsAR(Number(cheque.amount || 0)) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/guarantee-letters', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await query('SELECT gl.*, ba.account_name as bank_name FROM guarantee_letters gl LEFT JOIN bank_accounts ba ON gl.bank_id = ba.id ORDER BY gl.created_at DESC'));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/guarantee-letters', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { type, bank_id, amount, start_date, end_date, beneficiary, notes, status } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'النوع والمبلغ مطلوبان' });
    const letterNumber = await generateCodeAsync('LG-', 'guarantee_letters', 'letter_number');
    const result = await execute('INSERT INTO guarantee_letters (letter_number, type, bank_id, amount, start_date, end_date, beneficiary, notes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [letterNumber, type, bank_id || null, amount, start_date, end_date || null, beneficiary || null, notes || null, status || 'active', req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_guarantee_letter', 'guarantee_letter', result.id as number);
    res.json({ message: 'تم إنشاء خطاب الضمان', id: result.id, letter_number: letterNumber });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/guarantee-letters/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const valid = ['active', 'expired', 'cancelled', 'returned'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    await execute('UPDATE guarantee_letters SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'تم تحديث الحالة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/guarantee-letters/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM guarantee_letters WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/supplier-performance', async (req: AuthRequest, res: Response) => {
  try {
    const suppliers = await query('SELECT * FROM suppliers ORDER BY name') as any[];
    const poStats = await query(`SELECT supplier_id, COUNT(*) as po_count, SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received_count, SUM(CASE WHEN status = 'received' AND expected_date IS NOT NULL AND order_date <= expected_date THEN 1 ELSE 0 END) as on_time_count FROM purchase_orders GROUP BY supplier_id`) as any[];
    const poMap = new Map(poStats.map(r => [r.supplier_id, r]));
    const invStats = await query('SELECT supplier_id, COALESCE(SUM(total), 0) as t FROM purchase_invoices GROUP BY supplier_id') as any[];
    const invMap = new Map(invStats.map(r => [r.supplier_id, r.t]));
    const dnStats = await query('SELECT supplier_id, COUNT(*) as c, COALESCE(SUM(total), 0) as t FROM debit_notes GROUP BY supplier_id') as any[];
    const dnMap = new Map(dnStats.map(r => [r.supplier_id, r]));
    const data = suppliers.map((s: any) => {
      const po = poMap.get(s.id) || { po_count: 0, received_count: 0, on_time_count: 0 };
      const totalPurchases = invMap.get(s.id) || 0;
      const dn = dnMap.get(s.id) || { c: 0, t: 0 };
      const onTimeRate = po.po_count > 0 ? Math.round((po.on_time_count / Math.max(po.received_count, 1)) * 100) : 0;
      const returnRate = totalPurchases > 0 ? Math.round((dn.t / totalPurchases) * 100) : 0;
      const score = Math.max(0, Math.min(100, Math.round((onTimeRate * 0.6) + ((100 - returnRate) * 0.4))));
      return { id: s.id, name: s.name, phone: s.phone, rating: s.rating, rating_count: s.rating_count, po_count: po.po_count, received_count: po.received_count, on_time_rate: onTimeRate, total_purchases: totalPurchases, return_count: dn.c, return_rate: returnRate, score };
    });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/suppliers/:id/rating', async (req: AuthRequest, res: Response) => {
  try {
    const { rating } = req.body;
    const supplier = await queryOne('SELECT rating, rating_count FROM suppliers WHERE id = ?', [req.params.id]) as any;
    if (!supplier) return res.status(404).json({ error: 'المورد غير موجود' });
    const newCount = (supplier.rating_count || 0) + 1;
    const newRating = ((supplier.rating || 0) * (supplier.rating_count || 0) + rating) / newCount;
    await execute('UPDATE suppliers SET rating = ?, rating_count = ? WHERE id = ?', [newRating, newCount, req.params.id]);
    res.json({ message: 'تم تحديث التقييم', rating: newRating });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
