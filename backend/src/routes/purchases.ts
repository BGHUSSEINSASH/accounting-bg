import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, from, to, supplier_id, payment_status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE 1=1";
    const params: any[] = [];
    if (from) { query += " AND pi.invoice_date >= ?"; params.push(from); }
    if (to) { query += " AND pi.invoice_date <= ?"; params.push(to); }
    if (supplier_id) { query += " AND pi.supplier_id = ?"; params.push(supplier_id); }
    if (payment_status) { query += " AND pi.payment_status = ?"; params.push(payment_status); }
    const total = (db.prepare(query.replace("pi.*, s.name as supplier_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY pi.invoice_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const invoices = db.prepare(query).all(...params);
    res.json({ invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const invoice = db.prepare("SELECT pi.*, s.name as supplier_name, s.phone as supplier_phone FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = db.prepare("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?").all(req.params.id);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authorize("admin", "manager", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, invoice_date, items, discount = 0, tax = 0, payment_status = "unpaid", notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const invoiceNumber = generateCode("PUR", "purchase_invoices", "invoice_number");
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const total = subtotal - discount + tax;
      const result = db.prepare("INSERT INTO purchase_invoices (invoice_number, invoice_date, supplier_id, subtotal, discount, tax, total, payment_status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(invoiceNumber, invoice_date, supplier_id || null, subtotal, discount, tax, total, payment_status, notes || null, req.user!.id);
      const invoiceId = result.lastInsertRowid;
      const defaultWh = db.prepare("SELECT id FROM warehouses WHERE is_active = 1 ORDER BY id ASC LIMIT 1").get() as any;
      const insertItem = db.prepare("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity + ?, purchase_price = ? WHERE id = ?");
      const updateWh = defaultWh ? db.prepare("UPDATE warehouse_items SET quantity = quantity + ? WHERE warehouse_id = ? AND item_id = ?") : null;
      const insertWh = defaultWh ? db.prepare("INSERT OR IGNORE INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, 0)") : null;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(invoiceId, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.unit_price, item.item_id);
        if (updateWh && insertWh) {
          insertWh.run(defaultWh.id, item.item_id);
          updateWh.run(item.quantity, defaultWh.id, item.item_id);
        }
      }
      if (supplier_id && total > 0) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?").run(total, supplier_id);
      }
      return invoiceId;
    });
    const invoiceId = trx();
    logActivity(req.user!.id, "create_purchase", "purchase_invoice", invoiceId as number);
    res.json({ message: "Purchase invoice created", id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", authorize("admin", "manager", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, invoice_date, items, discount = 0, tax = 0, payment_status = "unpaid", notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM purchase_invoices WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    const oldItems = db.prepare("SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const oldItem of oldItems) {
        db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?").run(oldItem.quantity, oldItem.item_id);
      }
      if (existing.supplier_id && existing.total > 0) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?").run(existing.total, existing.supplier_id);
      }
      db.prepare("DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?").run(req.params.id);
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const total = subtotal - discount + tax;
      db.prepare("UPDATE purchase_invoices SET supplier_id = ?, invoice_date = ?, subtotal = ?, discount = ?, tax = ?, total = ?, payment_status = ?, notes = ? WHERE id = ?")
        .run(supplier_id || null, invoice_date, subtotal, discount, tax, total, payment_status, notes || null, req.params.id);
      const insertItem = db.prepare("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity + ?, purchase_price = ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.unit_price, item.item_id);
      }
      if (supplier_id && total > 0) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?").run(total, supplier_id);
      }
    });
    trx();
    logActivity(req.user!.id, "update_purchase", "purchase_invoice", parseInt(req.params.id));
    const updated = db.prepare("SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?").get(req.params.id) as any;
    updated.items = db.prepare("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?").all(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", authorize("admin", "manager", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const invoice = db.prepare("SELECT * FROM purchase_invoices WHERE id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const trx = db.transaction(() => {
      const items = db.prepare("SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?").all(req.params.id) as any[];
      for (const item of items) {
        db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?").run(item.quantity, item.item_id);
      }
      if (invoice.supplier_id && invoice.total > 0) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?").run(invoice.total, invoice.supplier_id);
      }
      db.prepare("DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?").run(req.params.id);
      db.prepare("DELETE FROM purchase_invoices WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "delete_purchase", "purchase_invoice", parseInt(req.params.id));
    res.json({ message: "Invoice deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/payment", authorize("admin", "manager", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_method, payment_date, reference_number, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount is required" });
    const db = getDatabase();
    const invoice = db.prepare("SELECT * FROM purchase_invoices WHERE id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const trx = db.transaction(() => {
      const newPaid = (invoice.paid_amount || 0) + amount;
      const newRemaining = invoice.total - newPaid;
      const status = newPaid >= invoice.total ? "paid" : "partial";
      db.prepare("UPDATE purchase_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?, payment_method = COALESCE(?, payment_method) WHERE id = ?")
        .run(newPaid, newRemaining, status, payment_method || null, req.params.id);
      if (invoice.supplier_id) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?").run(amount, invoice.supplier_id);
      }
      const payableAccount = db.prepare("SELECT id FROM accounts WHERE code = '2.1.1' AND is_active = 1 LIMIT 1").get() as any;
      const cashAccount = db.prepare("SELECT id FROM accounts WHERE code = '1.1.1' AND is_active = 1 LIMIT 1").get() as any;
      if (payableAccount && cashAccount) {
        const entryNumber = generateCode("JE", "journal_entries", "entry_number");
        const entryResult = db.prepare("INSERT INTO journal_entries (entry_number, entry_date, description, created_by, is_posted, reference_type, reference_id) VALUES (?, ?, ?, ?, 1, 'purchase', ?)")
          .run(entryNumber, payment_date || new Date().toISOString().split("T")[0], notes || "Payment for purchase invoice " + invoice.invoice_number, req.user!.id, req.params.id);
        const entryId = entryResult.lastInsertRowid;
        db.prepare("INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)").run(entryId, payableAccount.id, "Payment to supplier", amount, 0);
        db.prepare("INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)").run(entryId, cashAccount.id, "Payment to supplier", 0, amount);
        db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(amount, payableAccount.id);
        db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(amount, cashAccount.id);
      }
    });
    trx();
    logActivity(req.user!.id, "record_purchase_payment", "purchase_invoice", parseInt(req.params.id));
    res.json({ message: "Payment recorded" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id/print", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const invoice = db.prepare("SELECT pi.*, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address, s.tax_number as supplier_tax FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplier_id = s.id WHERE pi.id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = db.prepare("SELECT pii.*, i.name as item_name FROM purchase_invoice_items pii JOIN items i ON pii.item_id = i.id WHERE pii.purchase_invoice_id = ?").all(req.params.id);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
