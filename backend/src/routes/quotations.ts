import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT q.*, c.name as client_name FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE 1=1";
    const params: any[] = [];
    if (status) { sql += " AND q.status = ?"; params.push(status); }
    const countRow = await queryOne(sql.replace("q.*, c.name as client_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY q.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const quotations = await query(sql, params);
    res.json({ quotations, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const quotation = await queryOne("SELECT q.*, c.name as client_name FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE q.id = ?", [req.params.id]) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    quotation.items = await query("SELECT qi.*, i.name as item_name, i.code as item_code FROM quotation_items qi JOIN items i ON qi.item_id = i.id WHERE qi.quotation_id = ?", [req.params.id]);
    res.json(quotation);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { quote_date, client_id, sales_rep_id, valid_until, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const quoteNumber = await generateCodeAsync("Q-", "quotations", "quote_number");
    const quotationId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const discountAmount = subtotal * ((req.body.discount || 0) / 100);
      const taxAmount = (subtotal - discountAmount) * ((req.body.tax || 0) / 100);
      const total = subtotal - discountAmount + taxAmount;
      const result = await client.query(
        "INSERT INTO quotations (quote_number, quote_date, client_id, sales_rep_id, subtotal, discount, tax, total, status, valid_until, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11) RETURNING id",
        [quoteNumber, quote_date, client_id || null, sales_rep_id || req.user!.id, subtotal, discountAmount, taxAmount, total, valid_until || null, notes || null, req.user!.id]
      );
      const qid = result.rows[0].id;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO quotation_items (quotation_id, item_id, quantity, unit_price, discount, total) VALUES ($1,$2,$3,$4,$5,$6)",
          [qid, item.item_id, item.quantity, item.unit_price, item.discount || 0, itemTotal]);
      }
      return qid;
    });
    void logActivityAsync(req.user!.id, "create_quotation", "quotation", quotationId as number);
    res.json({ message: "Quotation created", id: quotationId, quote_number: quoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const quotation = await queryOne("SELECT id FROM quotations WHERE id = ?", [req.params.id]) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    const validStatuses = ["draft", "sent", "accepted", "rejected", "converted"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await execute("UPDATE quotations SET status = ? WHERE id = ?", [status, req.params.id]);
    void logActivityAsync(req.user!.id, "update_quotation_status", "quotation", parseInt(req.params.id), `Status changed to ${status}`);
    res.json({ message: "Quotation updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const quotation = await queryOne("SELECT id, status FROM quotations WHERE id = ?", [req.params.id]) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    if (quotation.status !== "draft") return res.status(400).json({ error: "Only draft quotations can be deleted" });
    await execute("DELETE FROM quotation_items WHERE quotation_id = ?", [req.params.id]);
    await execute("DELETE FROM quotations WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_quotation", "quotation", parseInt(req.params.id));
    res.json({ message: "Quotation deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/convert", async (req: AuthRequest, res: Response) => {
  try {
    const quotation = await queryOne("SELECT * FROM quotations WHERE id = ?", [req.params.id]) as any;
    if (!quotation) return res.status(404).json({ error: "Quotation not found" });
    if (quotation.status === "converted") return res.status(400).json({ error: "Quotation already converted" });
    const items = await query("SELECT qi.*, i.selling_price FROM quotation_items qi JOIN items i ON qi.item_id = i.id WHERE qi.quotation_id = ?", [req.params.id]) as any[];
    if (items.length === 0) return res.status(400).json({ error: "Quotation has no items" });
    const invoiceNumber = await generateCodeAsync("INV-", "sales_invoices", "invoice_number");
    const invoiceId = await withTransaction(async (client) => {
      const result = await client.query(
        "INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, payment_method, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'unpaid','credit',$10,$11) RETURNING id",
        [invoiceNumber, quotation.quote_date, quotation.client_id, quotation.sales_rep_id, quotation.subtotal, quotation.discount, quotation.tax, quotation.total, quotation.total, quotation.notes || null, req.user!.id]
      );
      const invId = result.rows[0].id;
      for (const item of items) {
        await client.query("INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, discount, total) VALUES ($1,$2,$3,$4,$5,$6)",
          [invId, item.item_id, item.quantity, item.unit_price, item.discount || 0, item.total]);
      }
      await client.query("UPDATE quotations SET status = 'converted' WHERE id = $1", [req.params.id]);
      return invId;
    });
    void logActivityAsync(req.user!.id, "convert_quotation", "quotation", parseInt(req.params.id), `Converted to invoice ${invoiceId}`);
    void logActivityAsync(req.user!.id, "create_sale", "sales_invoice", invoiceId as number);
    res.json({ message: "Quotation converted to invoice", invoice_id: invoiceId, invoice_number: invoiceNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
