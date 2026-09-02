import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from, to, client_id, sales_rep_id, payment_status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT si.*, c.name as client_name, c.phone as client_phone, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE 1=1";
    const params: any[] = [];
    if (from) { sql += " AND si.invoice_date >= ?"; params.push(from); }
    if (to) { sql += " AND si.invoice_date <= ?"; params.push(to); }
    if (client_id) { sql += " AND si.client_id = ?"; params.push(client_id); }
    if (sales_rep_id) { sql += " AND si.sales_rep_id = ?"; params.push(sales_rep_id); }
    if (payment_status) { sql += " AND si.payment_status = ?"; params.push(payment_status); }
    if (search) { sql += " AND (si.invoice_number LIKE ? OR c.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    const countRow = await queryOne(sql.replace("si.*, c.name as client_name, c.phone as client_phone, u.full_name as sales_rep_name", "COUNT(*) as total"), params);
    const total = countRow?.total ?? 0;
    sql += " ORDER BY si.invoice_date DESC, si.id DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const invoices = await query(sql, params);
    res.json({ invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats/by-rep", async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    let sql = "SELECT u.id, u.full_name, COUNT(si.id) as invoice_count, COALESCE(SUM(si.total), 0) as total_sales, COALESCE(SUM(si.paid_amount), 0) as total_collected FROM users u LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id";
    const params: any[] = [];
    if (from || to) { sql += " WHERE"; }
    if (from) { sql += " si.invoice_date >= ?"; params.push(from); }
    if (from && to) sql += " AND";
    if (to) { sql += " si.invoice_date <= ?"; params.push(to); }
    sql += " GROUP BY u.id, u.full_name ORDER BY total_sales DESC";
    const stats = await query(sql, params);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/map/data", async (_req: AuthRequest, res: Response) => {
  try {
    const data = await query("SELECT si.id, si.invoice_number, si.total, si.invoice_date, si.location_lat, si.location_lng, c.name as client_name, c.city FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.location_lat IS NOT NULL AND si.location_lng IS NOT NULL");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/print", async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.tax_number as client_tax, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT sii.*, i.name as item_name FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?", [req.params.id]);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.city as client_city, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?", [req.params.id]);
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authorize("admin", "manager", "accountant", "sales_rep"), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, invoice_date, items, discount = 0, tax = 0, paid_amount = 0, payment_method, notes, location_lat, location_lng, doctor_id, sales_rep_id, card_number, cardholder_name, transfer_reference } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const invoiceNumber = await generateCodeAsync("INV", "sales_invoices", "invoice_number");
    const repId = sales_rep_id || req.user!.id;
    const invoiceId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        if (itemData.current_quantity < item.quantity) throw new Error(`Insufficient quantity for ${itemData.name}`);
        subtotal += item.quantity * item.unit_price;
      }
      const discountAmount = subtotal * (discount / 100);
      const taxAmount = (subtotal - discountAmount) * (tax / 100);
      const total = subtotal - discountAmount + taxAmount;
      const remaining = total - paid_amount;
      const insRes = await client.query(
        "INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, payment_method, notes, location_lat, location_lng, created_by, card_number, cardholder_name, transfer_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id",
        [invoiceNumber, invoice_date, client_id || null, repId, subtotal, discountAmount, taxAmount, total, paid_amount, remaining,
          paid_amount >= total ? "paid" : paid_amount > 0 ? "partial" : "unpaid",
          payment_method || null, notes || null, location_lat || null, location_lng || null, req.user!.id,
          card_number || null, cardholder_name || null, transfer_reference || null]
      );
      const invId = insRes.rows[0].id;
      const defaultWh = await client.query("SELECT id FROM warehouses WHERE is_active = 1 ORDER BY id ASC LIMIT 1").then(r => r.rows[0]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES ($1,$2,$3,$4,$5,$6)",
          [invId, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
        if (defaultWh) {
          await client.query("UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND item_id = $3", [item.quantity, defaultWh.id, item.item_id]);
        }
      }
      if (doctor_id) {
        const doctor = await client.query("SELECT * FROM doctors WHERE id = $1", [doctor_id]).then(r => r.rows[0]);
        if (doctor) {
          const commissionAmount = total * (doctor.commission_percentage / 100);
          await client.query("INSERT INTO doctor_sales (doctor_id, sales_invoice_id, commission_amount) VALUES ($1,$2,$3)", [doctor_id, invId, commissionAmount]);
        }
      }
      if (client_id && remaining > 0) {
        await client.query("UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2", [remaining, client_id]);
      }
      return invId;
    });
    void logActivityAsync(req.user!.id, "create_sale", "sales_invoice", invoiceId as number);
    res.json({ message: "Invoice created", id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", authorize("admin", "manager", "accountant", "sales_rep"), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, invoice_date, items, discount = 0, tax = 0, paid_amount = 0, payment_method, notes, location_lat, location_lng, doctor_id, sales_rep_id, card_number, cardholder_name, transfer_reference } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const existing = await queryOne("SELECT * FROM sales_invoices WHERE id = ?", [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    const oldItems = await query("SELECT * FROM sales_invoice_items WHERE sales_invoice_id = ?", [req.params.id]) as any[];
    const repId = sales_rep_id || existing.sales_rep_id;
    await withTransaction(async (client) => {
      for (const oldItem of oldItems) {
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [oldItem.quantity, oldItem.item_id]);
      }
      await client.query("DELETE FROM doctor_sales WHERE sales_invoice_id = $1", [req.params.id]);
      if (existing.client_id && existing.remaining_amount > 0) {
        await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [existing.remaining_amount, existing.client_id]);
      }
      await client.query("DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1", [req.params.id]);
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        if (itemData.current_quantity < item.quantity) throw new Error(`Insufficient quantity for ${itemData.name}`);
        subtotal += item.quantity * item.unit_price;
      }
      const discountAmount = subtotal * (discount / 100);
      const taxAmount = (subtotal - discountAmount) * (tax / 100);
      const total = subtotal - discountAmount + taxAmount;
      const remaining = total - paid_amount;
      await client.query("UPDATE sales_invoices SET client_id = $1, invoice_date = $2, sales_rep_id = $3, subtotal = $4, discount = $5, tax = $6, total = $7, paid_amount = $8, remaining_amount = $9, payment_status = $10, payment_method = $11, notes = $12, location_lat = $13, location_lng = $14, card_number = $15, cardholder_name = $16, transfer_reference = $17 WHERE id = $18",
        [client_id || null, invoice_date, repId, subtotal, discountAmount, taxAmount, total, paid_amount, remaining,
          paid_amount >= total ? "paid" : paid_amount > 0 ? "partial" : "unpaid",
          payment_method || null, notes || null, location_lat || null, location_lng || null,
          card_number || null, cardholder_name || null, transfer_reference || null, req.params.id]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES ($1,$2,$3,$4,$5,$6)",
          [req.params.id, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (doctor_id) {
        const doctor = await client.query("SELECT * FROM doctors WHERE id = $1", [doctor_id]).then(r => r.rows[0]);
        if (doctor) {
          const commissionAmount = total * (doctor.commission_percentage / 100);
          await client.query("INSERT INTO doctor_sales (doctor_id, sales_invoice_id, commission_amount) VALUES ($1,$2,$3)", [doctor_id, req.params.id, commissionAmount]);
        }
      }
      if (client_id && remaining > 0) {
        await client.query("UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2", [remaining, client_id]);
      }
    });
    void logActivityAsync(req.user!.id, "update_sale", "sales_invoice", parseInt(req.params.id));
    const updated = await queryOne("SELECT si.*, c.name as client_name, c.phone as client_phone, c.address as client_address, c.city as client_city, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id WHERE si.id = ?", [req.params.id]) as any;
    updated.items = await query("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?", [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", authorize("admin", "manager", "accountant", "sales_rep"), async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT * FROM sales_invoices WHERE id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    await withTransaction(async (client) => {
      const items = await client.query("SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1", [req.params.id]).then(r => r.rows) as any[];
      for (const item of items) {
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      await client.query("DELETE FROM doctor_sales WHERE sales_invoice_id = $1", [req.params.id]);
      if (invoice.client_id && invoice.remaining_amount > 0) {
        await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [invoice.remaining_amount, invoice.client_id]);
      }
      await client.query("DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1", [req.params.id]);
      await client.query("DELETE FROM sales_invoices WHERE id = $1", [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "delete_sale", "sales_invoice", parseInt(req.params.id));
    res.json({ message: "Invoice deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/payment", authorize("admin", "manager", "accountant", "sales_rep"), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_method } = req.body;
    const invoice = await queryOne("SELECT * FROM sales_invoices WHERE id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    await withTransaction(async (client) => {
      const newPaid = invoice.paid_amount + amount;
      const newRemaining = invoice.total - newPaid;
      const status = newPaid >= invoice.total ? "paid" : "partial";
      await client.query("UPDATE sales_invoices SET paid_amount = $1, remaining_amount = $2, payment_status = $3, payment_method = COALESCE($4, payment_method) WHERE id = $5",
        [newPaid, newRemaining, status, payment_method || invoice.payment_method, req.params.id]);
      if (invoice.client_id) {
        await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [amount, invoice.client_id]);
      }
    });
    void logActivityAsync(req.user!.id, "record_payment", "sales_invoice", parseInt(req.params.id));
    res.json({ message: "Payment recorded" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
