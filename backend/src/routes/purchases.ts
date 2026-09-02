import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from, to, supplier_id, payment_status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE 1=1";
    const params: any[] = [];
    if (from) { sql += " AND pi.invoice_date >= ?"; params.push(from); }
    if (to) { sql += " AND pi.invoice_date <= ?"; params.push(to); }
    if (supplier_id) { sql += " AND pi.supplier_id = ?"; params.push(supplier_id); }
    if (payment_status) { sql += " AND pi.payment_status = ?"; params.push(payment_status); }
    const countRow = await queryOne(sql.replace("pi.*, s.name as supplier_name", "COUNT(*) as total"), params);
    const total = countRow?.total ?? 0;
    sql += " ORDER BY pi.invoice_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const invoices = await query(sql, params);
    res.json({ invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/print", async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT pi.*, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address, s.tax_number as supplier_tax FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?", [req.params.id]);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT pi.*, s.name as supplier_name, s.phone as supplier_phone FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?", [req.params.id]);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authorize("admin", "manager", "accountant"), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, invoice_date, items, discount = 0, tax = 0, payment_status = "unpaid", notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const invoiceNumber = await generateCodeAsync("PUR", "purchase_invoices", "invoice_number");
    const invoiceId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const total = subtotal - discount + tax;
      const insRes = await client.query(
        "INSERT INTO purchase_invoices (invoice_number, invoice_date, supplier_id, subtotal, discount, tax, total, payment_status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
        [invoiceNumber, invoice_date, supplier_id || null, subtotal, discount, tax, total, payment_status, notes || null, req.user!.id]
      );
      const invId = insRes.rows[0].id;
      const defaultWh = await client.query("SELECT id FROM warehouses WHERE is_active = 1 ORDER BY id ASC LIMIT 1").then(r => r.rows[0]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [invId, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity + $1, purchase_price = $2 WHERE id = $3",
          [item.quantity, item.unit_price, item.item_id]);
        if (defaultWh) {
          await client.query("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES ($1,$2,0) ON CONFLICT DO NOTHING", [defaultWh.id, item.item_id]);
          await client.query("UPDATE warehouse_items SET quantity = quantity + $1 WHERE warehouse_id = $2 AND item_id = $3", [item.quantity, defaultWh.id, item.item_id]);
        }
      }
      if (supplier_id && total > 0) {
        await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [total, supplier_id]);
      }
      return invId;
    });
    void logActivityAsync(req.user!.id, "create_purchase", "purchase_invoice", invoiceId as number);
    res.json({ message: "Purchase invoice created", id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", authorize("admin", "manager", "accountant"), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, invoice_date, items, discount = 0, tax = 0, payment_status = "unpaid", notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const existing = await queryOne("SELECT * FROM purchase_invoices WHERE id = ?", [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    const oldItems = await query("SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const oldItem of oldItems) {
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [oldItem.quantity, oldItem.item_id]);
      }
      if (existing.supplier_id && existing.total > 0) {
        await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [existing.total, existing.supplier_id]);
      }
      await client.query("DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1", [req.params.id]);
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const total = subtotal - discount + tax;
      await client.query("UPDATE purchase_invoices SET supplier_id = $1, invoice_date = $2, subtotal = $3, discount = $4, tax = $5, total = $6, payment_status = $7, notes = $8 WHERE id = $9",
        [supplier_id || null, invoice_date, subtotal, discount, tax, total, payment_status, notes || null, req.params.id]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity + $1, purchase_price = $2 WHERE id = $3",
          [item.quantity, item.unit_price, item.item_id]);
      }
      if (supplier_id && total > 0) {
        await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [total, supplier_id]);
      }
    });
    void logActivityAsync(req.user!.id, "update_purchase", "purchase_invoice", parseInt(req.params.id));
    const updated = await queryOne("SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?", [req.params.id]) as any;
    updated.items = await query("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?", [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", authorize("admin", "manager", "accountant"), async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT * FROM purchase_invoices WHERE id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    await withTransaction(async (client) => {
      const items = await client.query("SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1", [req.params.id]).then(r => r.rows) as any[];
      for (const item of items) {
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (invoice.supplier_id && invoice.total > 0) {
        await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [invoice.total, invoice.supplier_id]);
      }
      await client.query("DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1", [req.params.id]);
      await client.query("DELETE FROM purchase_invoices WHERE id = $1", [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "delete_purchase", "purchase_invoice", parseInt(req.params.id));
    res.json({ message: "Invoice deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/payment", authorize("admin", "manager", "accountant"), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_method, payment_date, reference_number, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount is required" });
    const invoice = await queryOne("SELECT * FROM purchase_invoices WHERE id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const entryNumber = await generateCodeAsync("JE", "journal_entries", "entry_number");
    await withTransaction(async (client) => {
      const newPaid = (invoice.paid_amount || 0) + amount;
      const newRemaining = invoice.total - newPaid;
      const status = newPaid >= invoice.total ? "paid" : "partial";
      await client.query("UPDATE purchase_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3, payment_method = COALESCE($4, payment_method) WHERE id = $5",
        [newPaid, newRemaining, status, payment_method || null, req.params.id]);
      if (invoice.supplier_id) {
        await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [amount, invoice.supplier_id]);
      }
      const payableAccount = await client.query("SELECT id FROM accounts WHERE code = '2.1.1' AND is_active = 1 LIMIT 1").then(r => r.rows[0]);
      const cashAccount = await client.query("SELECT id FROM accounts WHERE code = '1.1.1' AND is_active = 1 LIMIT 1").then(r => r.rows[0]);
      if (payableAccount && cashAccount) {
        const entryRes = await client.query(
          "INSERT INTO journal_entries (entry_number, entry_date, description, created_by, is_posted, reference_type, reference_id) VALUES ($1,$2,$3,$4,1,'purchase',$5) RETURNING id",
          [entryNumber, payment_date || new Date().toISOString().split("T")[0], notes || "Payment for purchase invoice " + invoice.invoice_number, req.user!.id, req.params.id]
        );
        const entryId = entryRes.rows[0].id;
        await client.query("INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5)",
          [entryId, payableAccount.id, "Payment to supplier", amount, 0]);
        await client.query("INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5)",
          [entryId, cashAccount.id, "Payment to supplier", 0, amount]);
        await client.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, payableAccount.id]);
        await client.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, cashAccount.id]);
      }
    });
    void logActivityAsync(req.user!.id, "record_purchase_payment", "purchase_invoice", parseInt(req.params.id));
    res.json({ message: "Payment recorded" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
