import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, client_id, total_amount, down_payment, installment_count, interval_days } = req.body;
    const remaining = total_amount - down_payment;
    const installment_amount = remaining / installment_count;
    const planId = await withTransaction(async (client) => {
      const result = await client.query(`INSERT INTO installment_plans (invoice_id, client_id, total_amount, down_payment, remaining_amount, installment_count, installment_amount, interval_days, start_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
        [invoice_id, client_id, total_amount, down_payment, remaining, installment_count, installment_amount, interval_days || 30]);
      const pid = result.rows[0].id;
      for (let i = 1; i <= installment_count; i++) {
        const dueDate = new Date(Date.now() + i * (interval_days || 30) * 86400000).toISOString().split('T')[0];
        await client.query(`INSERT INTO installment_payments (plan_id, due_date, amount) VALUES ($1,$2,$3)`, [pid, dueDate, installment_amount]);
      }
      return pid;
    });
    res.json({ id: planId });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.get('/client/:clientId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const plans = await query(`SELECT ip.*, si.invoice_number FROM installment_plans ip JOIN sales_invoices si ON si.id = ip.invoice_id WHERE ip.client_id = ? ORDER BY ip.created_at DESC`, [req.params.clientId]);
    res.json(plans);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.get('/:planId/payments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const payments = await query('SELECT * FROM installment_payments WHERE plan_id = ? ORDER BY due_date', [req.params.planId]);
    res.json(payments);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.post('/:planId/pay', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { payment_method, notes } = req.body;
    const result = await execute(`UPDATE installment_payments SET paid_date = NOW(), status = 'paid', payment_method = ?, notes = ? WHERE plan_id = ? AND status = 'pending' AND due_date = (SELECT MIN(due_date) FROM installment_payments WHERE plan_id = ? AND status = 'pending')`,
      [payment_method, notes, req.params.planId, req.params.planId]);
    const pendingRow = await queryOne("SELECT COUNT(*) as cnt FROM installment_payments WHERE plan_id = ? AND status != 'paid'", [req.params.planId]) as any;
    if (pendingRow?.cnt === 0) {
      await execute("UPDATE installment_plans SET status = 'completed' WHERE id = ?", [req.params.planId]);
    }
    res.json({ success: true, changes: result.rowCount });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
