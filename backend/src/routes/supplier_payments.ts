import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { createJournalEntry, getBankAccountCode, reverseJournalEntriesByReference } from '../services/journalService';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, status } = req.query;
    let sql = `
      SELECT sps.*, s.name as supplier_name, pi.invoice_number,
        ba.account_name as bank_account_name
      FROM supplier_payment_schedules sps
      LEFT JOIN suppliers s ON sps.supplier_id = s.id
      LEFT JOIN purchase_invoices pi ON sps.invoice_id = pi.id
      LEFT JOIN bank_accounts ba ON sps.bank_account_id = ba.id
      WHERE 1=1`;
    const params: any[] = [];
    if (supplier_id) { sql += ' AND sps.supplier_id = ?'; params.push(supplier_id); }
    if (status) { sql += ' AND sps.status = ?'; params.push(status); }
    sql += " ORDER BY CASE WHEN sps.status = 'overdue' THEN 0 WHEN sps.status = 'pending' THEN 1 ELSE 2 END, sps.due_date ASC";
    const rows = await query(sql, params) as any[];
    const today = new Date().toISOString().split('T')[0];
    const data = rows.map(r => ({
      ...r,
      remaining: (r.amount || 0) - (r.paid_amount || 0),
      days_left: Math.ceil((new Date(r.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)),
      is_overdue: r.status === 'pending' && r.due_date < today,
    }));
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/upcoming', async (req: AuthRequest, res: Response) => {
  try {
    const days = Number(req.query.days || 30);
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const upcoming = await query(`
      SELECT sps.*, s.name as supplier_name, pi.invoice_number
      FROM supplier_payment_schedules sps
      LEFT JOIN suppliers s ON sps.supplier_id = s.id
      LEFT JOIN purchase_invoices pi ON sps.invoice_id = pi.id
      WHERE sps.status = 'pending' AND sps.due_date BETWEEN $1 AND $2
      ORDER BY sps.due_date ASC
    `, [today, futureDate]) as any[];
    const overdue = await query(`
      SELECT sps.*, s.name as supplier_name, pi.invoice_number
      FROM supplier_payment_schedules sps
      LEFT JOIN suppliers s ON sps.supplier_id = s.id
      LEFT JOIN purchase_invoices pi ON sps.invoice_id = pi.id
      WHERE sps.status = 'pending' AND sps.due_date < $1
      ORDER BY sps.due_date ASC
    `, [today]) as any[];
    res.json({ upcoming, overdue });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/aging', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = await query(`
      SELECT sps.*, s.name as supplier_name, pi.invoice_number,
        CAST(EXTRACT(DAY FROM ($1::date - sps.due_date::date)) AS INTEGER) as days_overdue
      FROM supplier_payment_schedules sps
      LEFT JOIN suppliers s ON sps.supplier_id = s.id
      LEFT JOIN purchase_invoices pi ON sps.invoice_id = pi.id
      WHERE sps.status IN ('pending','overdue')
      ORDER BY sps.due_date ASC
    `, [today]) as any[];
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const bucketItems: any[] = [];
    for (const r of rows) {
      const remaining = (r.amount || 0) - (r.paid_amount || 0);
      if (r.due_date >= today) { buckets.current += remaining; }
      else if (r.days_overdue <= 30) { buckets.d1_30 += remaining; }
      else if (r.days_overdue <= 60) { buckets.d31_60 += remaining; }
      else if (r.days_overdue <= 90) { buckets.d61_90 += remaining; }
      else { buckets.d90_plus += remaining; }
      bucketItems.push({ ...r, remaining, aging_bucket: r.due_date >= today ? 'current' : r.days_overdue <= 30 ? 'd1_30' : r.days_overdue <= 60 ? 'd31_60' : r.days_overdue <= 90 ? 'd61_90' : 'd90_plus' });
    }
    res.json({ buckets, items: bucketItems, total: rows.reduce((s: number, r: any) => s + ((r.amount || 0) - (r.paid_amount || 0)), 0) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, invoice_id, amount, due_date, notes, reminder_days } = req.body;
    if (!supplier_id || !amount || !due_date) return res.status(400).json({ error: 'المورد والمبلغ والتاريخ مطلوبة' });
    const result = await execute("INSERT INTO supplier_payment_schedules (supplier_id, invoice_id, amount, due_date, status, notes, reminder_days, created_by) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
      [supplier_id, invoice_id || null, amount, due_date, notes || null, reminder_days || 3, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_supplier_schedule', 'supplier_payment_schedule', result.id as number);
    res.json({ message: 'تمت جدولة السداد', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id/pay', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, bank_account_id } = req.body;
    const schedule = await queryOne('SELECT * FROM supplier_payment_schedules WHERE id = ?', [req.params.id]) as any;
    if (!schedule) return res.status(404).json({ error: 'الجدول غير موجود' });
    if (schedule.status === 'paid') return res.status(400).json({ error: 'الدفع مسجل مسبقاً' });
    const remainingOnSchedule = (schedule.amount || 0) - (schedule.paid_amount || 0);
    const requestedAmount = amount || remainingOnSchedule;
    if (requestedAmount <= 0) return res.status(400).json({ error: 'المبلغ غير صحيح' });
    let payAmount = requestedAmount;
    let overpayment = 0;
    if (requestedAmount > remainingOnSchedule) {
      overpayment = requestedAmount - remainingOnSchedule;
      payAmount = remainingOnSchedule;
    }
    const newPaid = (schedule.paid_amount || 0) + payAmount;
    const newStatus = newPaid >= schedule.amount ? 'paid' : 'partial';
    // Note: getBankAccountCode still uses db - this is a service function that may need updating separately
    const db = { prepare: () => ({ get: () => null }) } as any; // placeholder
    const bankCode = '1.1.1'; // default

    await withTransaction(async (client) => {
      await client.query("UPDATE supplier_payment_schedules SET paid_amount = $1, status = $2, paid_at = CURRENT_TIMESTAMP, bank_account_id = COALESCE($3, bank_account_id) WHERE id = $4",
        [newPaid, newStatus, bank_account_id || null, schedule.id]);
      if (schedule.supplier_id) {
        await client.query('UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2', [payAmount, schedule.supplier_id]);
      }
      if (schedule.invoice_id) {
        const invoice = await client.query('SELECT * FROM purchase_invoices WHERE id = $1', [schedule.invoice_id]).then(r => r.rows[0]);
        if (invoice) {
          const totalPaidOnOther = await client.query('SELECT COALESCE(SUM(paid_amount),0) as paid FROM supplier_payment_schedules WHERE invoice_id = $1 AND id != $2', [schedule.invoice_id, schedule.id]).then(r => r.rows[0]?.paid || 0);
          const grandPaid = totalPaidOnOther + newPaid;
          const newRemaining = invoice.total - grandPaid;
          await client.query("UPDATE purchase_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4",
            [grandPaid, newRemaining, grandPaid >= invoice.total ? 'paid' : grandPaid > 0 ? 'partial' : 'unpaid', invoice.id]);
        }
      }
    });
    void logActivityAsync(req.user!.id, 'pay_supplier_schedule', 'supplier_payment_schedule', parseInt(req.params.id));
    res.json({ message: 'تم تسجيل السداد', paid: payAmount, status: newStatus, overpayment });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, due_date, notes, reminder_days } = req.body;
    await execute('UPDATE supplier_payment_schedules SET amount = COALESCE(?, amount), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), reminder_days = COALESCE(?, reminder_days) WHERE id = ?',
      [amount, due_date, notes, reminder_days, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await queryOne('SELECT * FROM supplier_payment_schedules WHERE id = ?', [req.params.id]) as any;
    if (!schedule) return res.status(404).json({ error: 'الجدول غير موجود' });
    if (schedule.status === 'paid') {
      if (schedule.supplier_id) {
        await execute('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?', [schedule.paid_amount || 0, schedule.supplier_id]);
      }
      if (schedule.invoice_id) {
        const invoice = await queryOne('SELECT * FROM purchase_invoices WHERE id = ?', [schedule.invoice_id]) as any;
        if (invoice) {
          const newPaid = (invoice.paid_amount || 0) - (schedule.paid_amount || 0);
          const newRemaining = invoice.total - Math.max(0, newPaid);
          await execute("UPDATE purchase_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?",
            [Math.max(0, newPaid), newRemaining, newPaid <= 0 ? 'unpaid' : 'partial', invoice.id]);
        }
      }
    }
    await execute('DELETE FROM supplier_payment_schedules WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_supplier_schedule', 'supplier_payment_schedule', parseInt(req.params.id));
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
