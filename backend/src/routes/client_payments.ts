import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, client_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE 1=1`;
    const params: any[] = [];
    if (client_id) { query += " AND cp.client_id = ?"; params.push(client_id); }
    const countQuery = query.replace(`SELECT cp.*, c.name as client_name, si.invoice_number`, "SELECT COUNT(*) as total");
    const total = (db.prepare(countQuery).get(...params) as any).total;
    query += " ORDER BY cp.payment_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const payments = db.prepare(query).all(...params);
    res.json({ payments, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const payment = db.prepare(`SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.id = ?`).get(req.params.id);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes } = req.body;
    if (!client_id || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: "client_id, amount, payment_date, payment_method are required" });
    }
    const db = getDatabase();
    const trx = db.transaction(() => {
      const result = db.prepare(`INSERT INTO client_payments (client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(client_id, sales_invoice_id || null, amount, payment_date, payment_method, reference_number || null, notes || null, req.user!.id);
      const paymentId = result.lastInsertRowid;
      if (sales_invoice_id) {
        const inv = db.prepare(`SELECT paid_amount, remaining_amount, total FROM sales_invoices WHERE id = ?`).get(sales_invoice_id) as any;
        if (inv) {
          const newPaid = inv.paid_amount + amount;
          const newRemaining = inv.remaining_amount - amount;
          const paymentStatus = newRemaining <= 0 ? "paid" : "partial";
          db.prepare(`UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?`)
            .run(newPaid, newRemaining, paymentStatus, sales_invoice_id);
        }
      }
      db.prepare(`UPDATE clients SET current_balance = current_balance - ? WHERE id = ?`).run(amount, client_id);
      return paymentId;
    });
    const paymentId = trx();
    logActivity(req.user!.id, "create_client_payment", "client_payment", paymentId as number);
    res.json({ message: "Payment created", id: paymentId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { client_id, sales_invoice_id, amount, payment_date, payment_method, reference_number, notes } = req.body;
    if (!client_id || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: "client_id, amount, payment_date, payment_method are required" });
    }
    const db = getDatabase();
    const existing = db.prepare(`SELECT * FROM client_payments WHERE id = ?`).get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    const trx = db.transaction(() => {
      if (existing.sales_invoice_id) {
        const inv = db.prepare(`SELECT paid_amount, remaining_amount FROM sales_invoices WHERE id = ?`).get(existing.sales_invoice_id) as any;
        if (inv) {
          const newPaid = inv.paid_amount - existing.amount;
          const newRemaining = inv.remaining_amount + existing.amount;
          let paymentStatus = "unpaid";
          if (newPaid > 0 && newRemaining > 0) paymentStatus = "partial";
          else if (newRemaining <= 0) paymentStatus = "paid";
          db.prepare(`UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?`)
            .run(newPaid, newRemaining, paymentStatus, existing.sales_invoice_id);
        }
      }
      db.prepare(`UPDATE clients SET current_balance = current_balance + ? WHERE id = ?`).run(existing.amount, existing.client_id);
      db.prepare(`UPDATE client_payments SET client_id = ?, sales_invoice_id = ?, amount = ?, payment_date = ?, payment_method = ?, reference_number = ?, notes = ? WHERE id = ?`)
        .run(client_id, sales_invoice_id || null, amount, payment_date, payment_method, reference_number || null, notes || null, req.params.id);
      if (sales_invoice_id) {
        const inv = db.prepare(`SELECT paid_amount, remaining_amount, total FROM sales_invoices WHERE id = ?`).get(sales_invoice_id) as any;
        if (inv) {
          const newPaid = inv.paid_amount + amount;
          const newRemaining = inv.remaining_amount - amount;
          const paymentStatus = newRemaining <= 0 ? "paid" : "partial";
          db.prepare(`UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?`)
            .run(newPaid, newRemaining, paymentStatus, sales_invoice_id);
        }
      }
      db.prepare(`UPDATE clients SET current_balance = current_balance - ? WHERE id = ?`).run(amount, client_id);
    });
    trx();
    logActivity(req.user!.id, "update_client_payment", "client_payment", parseInt(req.params.id));
    const updated = db.prepare(`SELECT cp.*, c.name as client_name, si.invoice_number FROM client_payments cp LEFT JOIN clients c ON cp.client_id = c.id LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.id = ?`).get(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const payment = db.prepare(`SELECT * FROM client_payments WHERE id = ?`).get(req.params.id) as any;
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    const trx = db.transaction(() => {
      if (payment.sales_invoice_id) {
        const inv = db.prepare(`SELECT paid_amount, remaining_amount FROM sales_invoices WHERE id = ?`).get(payment.sales_invoice_id) as any;
        if (inv) {
          const newPaid = inv.paid_amount - payment.amount;
          const newRemaining = inv.remaining_amount + payment.amount;
          let paymentStatus = "unpaid";
          if (newPaid > 0 && newRemaining > 0) paymentStatus = "partial";
          else if (newRemaining <= 0) paymentStatus = "paid";
          db.prepare(`UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?`)
            .run(newPaid, newRemaining, paymentStatus, payment.sales_invoice_id);
        }
      }
      db.prepare(`UPDATE clients SET current_balance = current_balance + ? WHERE id = ?`).run(payment.amount, payment.client_id);
      db.prepare(`DELETE FROM client_payments WHERE id = ?`).run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "delete_client_payment", "client_payment", parseInt(req.params.id));
    res.json({ message: "Payment deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
