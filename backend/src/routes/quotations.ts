import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { generateCode, logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT q.*, c.name as client_name FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE 1=1";
    const params: any[] = [];
    if (status) { query += " AND q.status = ?"; params.push(status); }
    const total = (db.prepare(query.replace("q.*, c.name as client_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY q.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const quotations = db.prepare(query).all(...params);
    res.json({ quotations, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const quotation = db.prepare("SELECT q.*, c.name as client_name FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE q.id = ?").get(req.params.id) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    quotation.items = db.prepare("SELECT qi.*, i.name as item_name, i.code as item_code FROM quotation_items qi JOIN items i ON qi.item_id = i.id WHERE qi.quotation_id = ?").all(req.params.id);
    res.json(quotation);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { quote_date, client_id, sales_rep_id, valid_until, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const quoteNumber = generateCode("Q-", "quotations", "quote_number");
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        subtotal += itemTotal;
      }
      const discountAmount = subtotal * ((req.body.discount || 0) / 100);
      const taxAmount = (subtotal - discountAmount) * ((req.body.tax || 0) / 100);
      const total = subtotal - discountAmount + taxAmount;
      const result = db.prepare("INSERT INTO quotations (quote_number, quote_date, client_id, sales_rep_id, subtotal, discount, tax, total, status, valid_until, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)")
        .run(quoteNumber, quote_date, client_id || null, sales_rep_id || req.user!.id, subtotal, discountAmount, taxAmount, total, valid_until || null, notes || null, req.user!.id);
      const quotationId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO quotation_items (quotation_id, item_id, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?)");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(quotationId, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal);
      }
      return quotationId;
    });
    const quotationId = trx();
    logActivity(req.user!.id, "create_quotation", "quotation", quotationId as number);
    res.json({ message: "Quotation created", id: quotationId, quote_number: quoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const db = getDatabase();
    const quotation = db.prepare("SELECT id FROM quotations WHERE id = ?").get(req.params.id) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    const validStatuses = ["draft", "sent", "accepted", "rejected", "converted"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    db.prepare("UPDATE quotations SET status = ? WHERE id = ?").run(status, req.params.id);
    logActivity(req.user!.id, "update_quotation_status", "quotation", parseInt(req.params.id), `Status changed to ${status}`);
    res.json({ message: "Quotation updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const quotation = db.prepare("SELECT id, status FROM quotations WHERE id = ?").get(req.params.id) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    if (quotation.status !== "draft") return res.status(400).json({ error: "Only draft quotations can be deleted" });
    db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").run(req.params.id);
    db.prepare("DELETE FROM quotations WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_quotation", "quotation", parseInt(req.params.id));
    res.json({ message: "Quotation deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/convert", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const quotation = db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    if (quotation.status === "converted") return res.status(400).json({ error: "Quotation already converted" });
    const items = db.prepare("SELECT qi.*, i.selling_price FROM quotation_items qi JOIN items i ON qi.item_id = i.id WHERE qi.quotation_id = ?").all(req.params.id) as any[];
    if (items.length === 0) return res.status(400).json({ error: "Quotation has no items" });
    const invoiceNumber = generateCode("INV-", "sales_invoices", "invoice_number");
    const trx = db.transaction(() => {
      const result = db.prepare("INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'unpaid', 'credit', ?, ?)")
        .run(invoiceNumber, quotation.quote_date, quotation.client_id, quotation.sales_rep_id, quotation.subtotal, quotation.discount, quotation.tax, quotation.total, quotation.total, quotation.notes || null, req.user!.id);
      const invoiceId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?)");
      for (const item of items) {
        insertItem.run(invoiceId, item.item_id, item.quantity, item.unit_price, item.discount || 0, item.total);
      }
      db.prepare("UPDATE quotations SET status = 'converted' WHERE id = ?").run(req.params.id);
      return invoiceId;
    });
    const invoiceId = trx();
    logActivity(req.user!.id, "convert_quotation", "quotation", parseInt(req.params.id), `Converted to invoice ${invoiceId}`);
    logActivity(req.user!.id, "create_sale", "sales_invoice", invoiceId as number);
    res.json({ message: "Quotation converted to invoice", invoice_id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
