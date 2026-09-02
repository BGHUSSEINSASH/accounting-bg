import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { createJournalEntry, reverseJournalEntriesByReference } from '../services/journalService';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, partner_type, state, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT * FROM batch_payments WHERE 1=1";
    const params: any[] = [];
    if (type) { sql += " AND type = ?"; params.push(type); }
    if (partner_type) { sql += " AND partner_type = ?"; params.push(partner_type); }
    if (state) { sql += " AND state = ?"; params.push(state); }
    const countRow = await queryOne(sql.replace('*', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const batches = await query(sql, params) as any[];
    for (const b of batches) {
      b.lines = await query("SELECT * FROM batch_payment_lines WHERE batch_id = ?", [b.id]);
      if (b.partner_type === 'client') {
        const c = await queryOne("SELECT name FROM clients WHERE id = ?", [b.partner_id]) as any;
        b.partner_name = c?.name;
      } else {
        const s = await queryOne("SELECT name FROM suppliers WHERE id = ?", [b.partner_id]) as any;
        b.partner_name = s?.name;
      }
    }
    res.json({ batches, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const batch = await queryOne("SELECT * FROM batch_payments WHERE id = ?", [req.params.id]) as any;
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    batch.lines = await query("SELECT * FROM batch_payment_lines WHERE batch_id = ?", [batch.id]);
    res.json(batch);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { type, partner_type, partner_id, payment_date, payment_method, bank_account_id, notes, lines } = req.body;
    if (!lines || lines.length === 0) return res.status(400).json({ error: 'At least one line required' });
    const batchNumber = await generateCodeAsync('BP', 'batch_payments', 'batch_number');
    const batchId = await withTransaction(async (client) => {
      const totalAmount = lines.reduce((s: number, l: any) => s + l.amount, 0);
      const result = await client.query("INSERT INTO batch_payments (batch_number, type, partner_type, partner_id, total_amount, state, payment_date, payment_method, bank_account_id, notes, created_by) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10) RETURNING id",
        [batchNumber, type || (partner_type === 'client' ? 'inbound' : 'outbound'), partner_type, partner_id, totalAmount, payment_date || new Date().toISOString().split('T')[0], payment_method || null, bank_account_id || null, notes || null, req.user!.id]);
      const bid = result.rows[0].id;
      for (const line of lines) {
        await client.query("INSERT INTO batch_payment_lines (batch_id, invoice_id, invoice_type, amount) VALUES ($1,$2,$3,$4)",
          [bid, line.invoice_id, line.invoice_type || (partner_type === 'client' ? 'sale' : 'purchase'), line.amount]);
      }
      return bid;
    });
    void logActivityAsync(req.user!.id, 'create_batch_payment', 'batch_payment', batchId as number);
    res.json({ message: 'Batch payment created', id: batchId, batch_number: batchNumber });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const batch = await queryOne("SELECT * FROM batch_payments WHERE id = ?", [req.params.id]) as any;
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (batch.state !== 'draft') return res.status(400).json({ error: 'Only draft batches can be posted' });
    const lines = await query("SELECT * FROM batch_payment_lines WHERE batch_id = ?", [batch.id]) as any[];
    await withTransaction(async (client) => {
      for (const line of lines) {
        if (batch.partner_type === 'client' && line.invoice_type === 'sale') {
          const inv = await client.query("SELECT * FROM sales_invoices WHERE id = $1", [line.invoice_id]).then(r => r.rows[0]);
          if (inv) {
            const newPaid = (inv.paid_amount || 0) + line.amount;
            const newRemaining = inv.total - newPaid;
            const status = newPaid >= inv.total ? 'paid' : 'partial';
            await client.query("UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4", [newPaid, newRemaining, status, line.invoice_id]);
            if (inv.client_id) await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [line.amount, inv.client_id]);
          }
        } else if (batch.partner_type === 'supplier' && line.invoice_type === 'purchase') {
          const inv = await client.query("SELECT * FROM purchase_invoices WHERE id = $1", [line.invoice_id]).then(r => r.rows[0]);
          if (inv) {
            const newPaid = (inv.paid_amount || 0) + line.amount;
            const newRemaining = inv.total - newPaid;
            const status = newPaid >= inv.total ? 'paid' : 'partial';
            await client.query("UPDATE purchase_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4", [newPaid, newRemaining, status, line.invoice_id]);
            if (inv.supplier_id) await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [line.amount, inv.supplier_id]);
          }
        }
      }
      await client.query("UPDATE batch_payments SET state = 'posted' WHERE id = $1", [batch.id]);
    });
    void logActivityAsync(req.user!.id, 'post_batch_payment', 'batch_payment', parseInt(req.params.id));
    res.json({ message: 'Batch payment posted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/cancel', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const batch = await queryOne("SELECT * FROM batch_payments WHERE id = ?", [req.params.id]) as any;
    if (batch && batch.state === 'posted') {
      const lines = await query("SELECT * FROM batch_payment_lines WHERE batch_id = ?", [batch.id]) as any[];
      await withTransaction(async (client) => {
        for (const line of lines) {
          if (batch.partner_type === 'client' && line.invoice_type === 'sale') {
            const inv = await client.query("SELECT * FROM sales_invoices WHERE id = $1", [line.invoice_id]).then(r => r.rows[0]);
            if (inv) {
              const newPaid = Math.max(0, (inv.paid_amount || 0) - line.amount);
              const newRemaining = inv.total - newPaid;
              await client.query("UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4",
                [newPaid, newRemaining, newPaid >= inv.total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid', line.invoice_id]);
              if (inv.client_id) await client.query("UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2", [line.amount, inv.client_id]);
            }
          } else if (batch.partner_type === 'supplier' && line.invoice_type === 'purchase') {
            const inv = await client.query("SELECT * FROM purchase_invoices WHERE id = $1", [line.invoice_id]).then(r => r.rows[0]);
            if (inv) {
              const newPaid = Math.max(0, (inv.paid_amount || 0) - line.amount);
              const newRemaining = inv.total - newPaid;
              await client.query("UPDATE purchase_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4",
                [newPaid, newRemaining, newPaid >= inv.total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid', line.invoice_id]);
              if (inv.supplier_id) await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [line.amount, inv.supplier_id]);
            }
          }
        }
        await client.query("UPDATE batch_payments SET state = 'cancelled' WHERE id = $1", [req.params.id]);
      });
    } else {
      await execute("UPDATE batch_payments SET state = 'cancelled' WHERE id = ?", [req.params.id]);
    }
    void logActivityAsync(req.user!.id, 'cancel_batch_payment', 'batch_payment', parseInt(req.params.id));
    res.json({ message: 'Batch payment cancelled' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
