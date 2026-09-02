import { Router, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/client/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.params.clientId]) as any;
    if (!client) return res.status(404).json({ error: 'Client not found' });
    let invQuery = `SELECT id, invoice_number, created_at as date, total as amount, paid_amount, CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'unpaid' END as status, 'invoice' as type FROM sales_invoices WHERE client_id = ?`;
    const invParams: any[] = [req.params.clientId];
    if (from) { invQuery += ' AND created_at >= ?'; invParams.push(from); }
    if (to) { invQuery += ' AND created_at <= ?'; invParams.push(to); }
    let payQuery = `SELECT id, payment_date as date, amount, payment_method, 'payment' as type FROM client_payments WHERE client_id = ?`;
    const payParams: any[] = [req.params.clientId];
    if (from) { payQuery += ' AND payment_date >= ?'; payParams.push(from); }
    if (to) { payQuery += ' AND payment_date <= ?'; payParams.push(to); }
    const invoices = await query(invQuery, invParams) as any[];
    const payments = await query(payQuery, payParams) as any[];
    const transactions = [...invoices.map(i => ({ ...i, debit: i.amount, credit: i.paid_amount || 0, ref: i.invoice_number })), ...payments.map(p => ({ ...p, debit: 0, credit: p.amount, ref: `دفعة ${p.id}`, invoice_number: '' }))];
    transactions.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let balance = 0;
    const withBalance = transactions.map((t: any) => { balance += (t.debit || 0) - (t.credit || 0); return { ...t, running_balance: balance }; });
    res.json({ client, transactions: withBalance, current_balance: balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/supplier/:supplierId', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.params.supplierId]) as any;
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    let sql = `SELECT id, invoice_number, created_at as date, total as amount, paid_amount, payment_status as status FROM purchase_invoices WHERE supplier_id = ?`;
    const params: any[] = [req.params.supplierId];
    if (from) { sql += ' AND created_at >= ?'; params.push(from); }
    if (to) { sql += ' AND created_at <= ?'; params.push(to); }
    const invoices = await query(sql, params);
    let balance = 0;
    const withBalance = invoices.map((inv: any) => { balance += inv.amount - (inv.paid_amount || 0); return { ...inv, running_balance: balance }; });
    res.json({ supplier, transactions: withBalance, current_balance: balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
