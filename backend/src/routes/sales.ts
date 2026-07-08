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
    const { page = 1, limit = 20, from, to, client_id, sales_rep_id, payment_status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT si.*, c.name as client_name, c.phone as client_phone, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE 1=1";
    const params: any[] = [];
    if (from) { query += " AND si.invoice_date >= ?"; params.push(from); }
    if (to) { query += " AND si.invoice_date <= ?"; params.push(to); }
    if (client_id) { query += " AND si.client_id = ?"; params.push(client_id); }
    if (sales_rep_id) { query += " AND si.sales_rep_id = ?"; params.push(sales_rep_id); }
    if (payment_status) { query += " AND si.payment_status = ?"; params.push(payment_status); }
    if (search) { query += " AND (si.invoice_number LIKE ? OR c.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    const total = (db.prepare(query.replace("si.*, c.name as client_name, c.phone as client_phone, u.full_name as sales_rep_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY si.invoice_date DESC, si.id DESC LIMIT ? OFFSET ?";
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
    const invoice = db.prepare("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.city as client_city, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = db.prepare("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?").all(req.params.id);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authorize("admin", "manager", "accountant", "sales_rep"), (req: AuthRequest, res: Response) => {
  try {
    const { client_id, invoice_date, items, discount = 0, tax = 0, paid_amount = 0, payment_method, notes, location_lat, location_lng, doctor_id, sales_rep_id, card_number, cardholder_name, transfer_reference } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const invoiceNumber = generateCode("INV", "sales_invoices", "invoice_number");
    const repId = sales_rep_id || req.user!.id;
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        if (itemData.current_quantity < item.quantity) throw new Error(`Insufficient quantity for ${itemData.name}`);
        const itemTotal = item.quantity * item.unit_price;
        subtotal += itemTotal;
      }
      const discountAmount = subtotal * (discount / 100);
      const taxAmount = (subtotal - discountAmount) * (tax / 100);
      const total = subtotal - discountAmount + taxAmount;
      const remaining = total - paid_amount;
      const result = db.prepare("INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, payment_method, notes, location_lat, location_lng, created_by, card_number, cardholder_name, transfer_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        invoiceNumber, invoice_date, client_id || null, repId, subtotal, discountAmount, taxAmount, total, paid_amount, remaining,
        paid_amount >= total ? "paid" : paid_amount > 0 ? "partial" : "unpaid",
        payment_method || null, notes || null, location_lat || null, location_lng || null, req.user!.id,
        card_number || null, cardholder_name || null, transfer_reference || null);
      const invoiceId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?)");
      const defaultWh = db.prepare("SELECT id FROM warehouses WHERE is_active = 1 ORDER BY id ASC LIMIT 1").get() as any;
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?");
      const updateWh = defaultWh ? db.prepare("UPDATE warehouse_items SET quantity = quantity - ? WHERE warehouse_id = ? AND item_id = ?") : null;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(invoiceId, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal);
        updateQty.run(item.quantity, item.item_id);
        if (updateWh) updateWh.run(item.quantity, defaultWh.id, item.item_id);
      }
      if (doctor_id) {
        const doctor = db.prepare("SELECT * FROM doctors WHERE id = ?").get(doctor_id) as any;
        if (doctor) {
          const commissionAmount = total * (doctor.commission_percentage / 100);
          db.prepare("INSERT INTO doctor_sales (doctor_id, sales_invoice_id, commission_amount) VALUES (?, ?, ?)").run(doctor_id, invoiceId, commissionAmount);
        }
      }
      if (client_id && remaining > 0) {
        db.prepare("UPDATE clients SET current_balance = current_balance + ? WHERE id = ?").run(remaining, client_id);
      }
      return invoiceId;
    });
    const invoiceId = trx();
    logActivity(req.user!.id, "create_sale", "sales_invoice", invoiceId as number);
    res.json({ message: "Invoice created", id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", authorize("admin", "manager", "accountant", "sales_rep"), (req: AuthRequest, res: Response) => {
  try {
    const { client_id, invoice_date, items, discount = 0, tax = 0, paid_amount = 0, payment_method, notes, location_lat, location_lng, doctor_id, sales_rep_id, card_number, cardholder_name, transfer_reference } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    const oldItems = db.prepare("SELECT * FROM sales_invoice_items WHERE sales_invoice_id = ?").all(req.params.id) as any[];
    const oldDoctorSale = db.prepare("SELECT * FROM doctor_sales WHERE sales_invoice_id = ?").get(req.params.id) as any;
    const repId = sales_rep_id || existing.sales_rep_id;
    const trx = db.transaction(() => {
      for (const oldItem of oldItems) {
        db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?").run(oldItem.quantity, oldItem.item_id);
      }
      if (oldDoctorSale) {
        db.prepare("DELETE FROM doctor_sales WHERE sales_invoice_id = ?").run(req.params.id);
      }
      if (existing.client_id && existing.remaining_amount > 0) {
        db.prepare("UPDATE clients SET current_balance = current_balance - ? WHERE id = ?").run(existing.remaining_amount, existing.client_id);
      }
      db.prepare("DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?").run(req.params.id);
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        if (itemData.current_quantity < item.quantity) throw new Error(`Insufficient quantity for ${itemData.name}`);
        const itemTotal = item.quantity * item.unit_price;
        subtotal += itemTotal;
      }
      const discountAmount = subtotal * (discount / 100);
      const taxAmount = (subtotal - discountAmount) * (tax / 100);
      const total = subtotal - discountAmount + taxAmount;
      const remaining = total - paid_amount;
      db.prepare("UPDATE sales_invoices SET client_id = ?, invoice_date = ?, sales_rep_id = ?, subtotal = ?, discount = ?, tax = ?, total = ?, paid_amount = ?, remaining_amount = ?, payment_status = ?, payment_method = ?, notes = ?, location_lat = ?, location_lng = ?, card_number = ?, cardholder_name = ?, transfer_reference = ? WHERE id = ?").run(
        client_id || null, invoice_date, repId, subtotal, discountAmount, taxAmount, total, paid_amount, remaining,
        paid_amount >= total ? "paid" : paid_amount > 0 ? "partial" : "unpaid",
        payment_method || null, notes || null, location_lat || null, location_lng || null,
        card_number || null, cardholder_name || null, transfer_reference || null, req.params.id);
      const insertItem = db.prepare("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(req.params.id, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal);
        updateQty.run(item.quantity, item.item_id);
      }
      if (doctor_id) {
        const doctor = db.prepare("SELECT * FROM doctors WHERE id = ?").get(doctor_id) as any;
        if (doctor) {
          const commissionAmount = total * (doctor.commission_percentage / 100);
          db.prepare("INSERT INTO doctor_sales (doctor_id, sales_invoice_id, commission_amount) VALUES (?, ?, ?)").run(doctor_id, req.params.id, commissionAmount);
        }
      }
      if (client_id && remaining > 0) {
        db.prepare("UPDATE clients SET current_balance = current_balance + ? WHERE id = ?").run(remaining, client_id);
      }
    });
    trx();
    logActivity(req.user!.id, "update_sale", "sales_invoice", parseInt(req.params.id));
    const updated = db.prepare("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.city as client_city, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?").get(req.params.id) as any;
    updated.items = db.prepare("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?").all(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", authorize("admin", "manager", "accountant", "sales_rep"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const invoice = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const trx = db.transaction(() => {
      const items = db.prepare("SELECT * FROM sales_invoice_items WHERE sales_invoice_id = ?").all(req.params.id) as any[];
      for (const item of items) {
        db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?").run(item.quantity, item.item_id);
      }
      db.prepare("DELETE FROM doctor_sales WHERE sales_invoice_id = ?").run(req.params.id);
      if (invoice.client_id && invoice.remaining_amount > 0) {
        db.prepare("UPDATE clients SET current_balance = current_balance - ? WHERE id = ?").run(invoice.remaining_amount, invoice.client_id);
      }
      db.prepare("DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?").run(req.params.id);
      db.prepare("DELETE FROM sales_invoices WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "delete_sale", "sales_invoice", parseInt(req.params.id));
    res.json({ message: "Invoice deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/payment", authorize("admin", "manager", "accountant", "sales_rep"), (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_method } = req.body;
    const db = getDatabase();
    const invoice = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const trx = db.transaction(() => {
      const newPaid = invoice.paid_amount + amount;
      const newRemaining = invoice.total - newPaid;
      const status = newPaid >= invoice.total ? "paid" : "partial";
      db.prepare("UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?, payment_method = COALESCE(?, payment_method) WHERE id = ?")
        .run(newPaid, newRemaining, status, payment_method || invoice.payment_method, req.params.id);
      if (invoice.client_id) {
        db.prepare("UPDATE clients SET current_balance = current_balance - ? WHERE id = ?").run(amount, invoice.client_id);
      }
    });
    trx();
    logActivity(req.user!.id, "record_payment", "sales_invoice", parseInt(req.params.id));
    res.json({ message: "Payment recorded" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id/print", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const invoice = db.prepare("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.tax_number as client_tax, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?").get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = db.prepare("SELECT sii.*, i.name as item_name FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?").all(req.params.id);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats/by-rep", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let query = "SELECT u.id, u.full_name, COUNT(si.id) as invoice_count, COALESCE(SUM(si.total), 0) as total_sales, COALESCE(SUM(si.paid_amount), 0) as total_collected FROM users u LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id";
    const params: any[] = [];
    if (from || to) { query += " WHERE"; }
    if (from) { query += " si.invoice_date >= ?"; params.push(from); }
    if (from && to) query += " AND";
    if (to) { query += " si.invoice_date <= ?"; params.push(to); }
    query += " GROUP BY u.id, u.full_name ORDER BY total_sales DESC";
    const stats = db.prepare(query).all(...params);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/map/data", (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const data = db.prepare("SELECT si.id, si.invoice_number, si.total, si.invoice_date, si.location_lat, si.location_lng, c.name as client_name, c.city FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.location_lat IS NOT NULL AND si.location_lng IS NOT NULL").all();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
