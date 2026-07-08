import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.post('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { invoice_id, client_id, total_amount, down_payment, installment_count, interval_days } = req.body;
    const remaining = total_amount - down_payment;
    const installment_amount = remaining / installment_count;
    const trx = db.transaction(() => {
      const result = db.prepare(`INSERT INTO installment_plans (invoice_id, client_id, total_amount, down_payment, remaining_amount, installment_count, installment_amount, interval_days, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE('now'))`).run(invoice_id, client_id, total_amount, down_payment, remaining, installment_count, installment_amount, interval_days || 30);
      const planId = result.lastInsertRowid;
      const insertPayment = db.prepare(`INSERT INTO installment_payments (plan_id, due_date, amount) VALUES (?, DATE('now', '+' || (? * ?) || ' days'), ?)`);
      for (let i = 1; i <= installment_count; i++) {
        insertPayment.run(planId, i, interval_days || 30, installment_amount);
      }
      return planId;
    });
    const planId = trx();
    res.json({ id: planId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/client/:clientId', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const plans = db.prepare(`SELECT ip.*, si.invoice_number FROM installment_plans ip JOIN sales_invoices si ON si.id = ip.invoice_id WHERE ip.client_id = ? ORDER BY ip.created_at DESC`).all(req.params.clientId);
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:planId/payments', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const payments = db.prepare('SELECT * FROM installment_payments WHERE plan_id = ? ORDER BY due_date').all(req.params.planId);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:planId/pay', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { payment_method, notes } = req.body;
    const result = db.prepare(`UPDATE installment_payments SET paid_date = DATE('now'), status = 'paid', payment_method = ?, notes = ? WHERE plan_id = ? AND status = 'pending' ORDER BY due_date LIMIT 1`).run(payment_method, notes, req.params.planId);
    const pending = db.prepare("SELECT COUNT(*) as cnt FROM installment_payments WHERE plan_id = ? AND status != 'paid'").get(req.params.planId) as any;
    if (pending.cnt === 0) {
      db.prepare("UPDATE installment_plans SET status = 'completed' WHERE id = ?").run(req.params.planId);
    }
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
