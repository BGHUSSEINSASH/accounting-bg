import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, client_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE 1=1`;
    const params: any[] = [];
    if (client_id) { sql += " AND cp.client_id = ?"; params.push(client_id); }
    const countRow = await queryOne(sql.replace(`SELECT cp.*, c.name as client_name, si.invoice_number`, "SELECT COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY cp.payment_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const payments = await query(sql, params);
    res.json({ payments, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const payment = await queryOne(`SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.id = ?`, [req.params.id]);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes } = req.body;
    if (!client_id || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: "client_id, amount, payment_date, payment_method are required" });
    }
    const paymentId = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO client_payments (client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [client_id, sales_invoice_id || null, amount, payment_date, payment_method, reference_number || null, notes || null, req.user!.id]
      );
      const pid = result.rows[0].id;
      if (sales_invoice_id) {
        const inv = await client.query(`SELECT paid_amount, remaining_amount, total FROM sales_invoices WHERE id = $1`, [sales_invoice_id]).then(r => r.rows[0]);
        if (inv) {
          const newPaid = inv.paid_amount + amount;
          const newRemaining = inv.remaining_amount - amount;
          const paymentStatus = newRemaining <= 0 ? "paid" : "partial";
          await client.query(`UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4`,
            [newPaid, newRemaining, paymentStatus, sales_invoice_id]);
        }
      }
      await client.query(`UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2`, [amount, client_id]);
      return pid;
    });
    void logActivityAsync(req.user!.id, "create_client_payment", "client_payment", paymentId as number);
    res.json({ message: "Payment created", id: paymentId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes } = req.body;
    if (!client_id || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: "client_id, amount, payment_date, payment_method are required" });
    }
    const existing = await queryOne(`SELECT * FROM client_payments WHERE id = ?`, [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    await withTransaction(async (client) => {
      if (existing.sales_invoice_id) {
        const inv = await client.query(`SELECT paid_amount, remaining_amount FROM sales_invoices WHERE id = $1`, [existing.sales_invoice_id]).then(r => r.rows[0]);
        if (inv) {
          const newPaid = inv.paid_amount - existing.amount;
          const newRemaining = inv.remaining_amount + existing.amount;
          let paymentStatus = "unpaid";
          if (newPaid > 0 && newRemaining > 0) paymentStatus = "partial";
          else if (newRemaining <= 0) paymentStatus = "paid";
          await client.query(`UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4`,
            [newPaid, newRemaining, paymentStatus, existing.sales_invoice_id]);
        }
      }
      await client.query(`UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2`, [existing.amount, existing.client_id]);
      await client.query(`UPDATE client_payments SET client_id = $1, sales_invoice_id = $2, amount = $3, payment_date = $4, payment_method = $5, reference_number = $6, notes = $7 WHERE id = $8`,
        [client_id, sales_invoice_id || null, amount, payment_date, payment_method, reference_number || null, notes || null, req.params.id]);
      if (sales_invoice_id) {
        const inv = await client.query(`SELECT paid_amount, remaining_amount, total FROM sales_invoices WHERE id = $1`, [sales_invoice_id]).then(r => r.rows[0]);
        if (inv) {
          const newPaid = inv.paid_amount + amount;
          const newRemaining = inv.remaining_amount - amount;
          const paymentStatus = newRemaining <= 0 ? "paid" : "partial";
          await client.query(`UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4`,
            [newPaid, newRemaining, paymentStatus, sales_invoice_id]);
        }
      }
      await client.query(`UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2`, [amount, client_id]);
    });
    void logActivityAsync(req.user!.id, "update_client_payment", "client_payment", parseInt(req.params.id));
    const updated = await queryOne(`SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const payment = await queryOne(`SELECT * FROM client_payments WHERE id = ?`, [req.params.id]) as any;
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    await withTransaction(async (client) => {
      if (payment.sales_invoice_id) {
        const inv = await client.query(`SELECT paid_amount, remaining_amount FROM sales_invoices WHERE id = $1`, [payment.sales_invoice_id]).then(r => r.rows[0]);
        if (inv) {
          const newPaid = inv.paid_amount - payment.amount;
          const newRemaining = inv.remaining_amount + payment.amount;
          let paymentStatus = "unpaid";
          if (newPaid > 0 && newRemaining > 0) paymentStatus = "partial";
          else if (newRemaining <= 0) paymentStatus = "paid";
          await client.query(`UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE id = $4`,
            [newPaid, newRemaining, paymentStatus, payment.sales_invoice_id]);
        }
      }
      await client.query(`UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2`, [payment.amount, payment.client_id]);
      await client.query(`DELETE FROM client_payments WHERE id = $1`, [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "delete_client_payment", "client_payment", parseInt(req.params.id));
    res.json({ message: "Payment deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
