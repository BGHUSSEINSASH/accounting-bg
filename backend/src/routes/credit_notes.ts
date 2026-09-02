import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, client_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE 1=1`;
    const params: any[] = [];
    if (client_id) { sql += " AND cn.client_id = ?"; params.push(client_id); }
    const countRow = await queryOne(sql.replace("cn.*, c.name as client_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY cn.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const creditNotes = await query(sql, params);
    res.json({ credit_notes: creditNotes, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const creditNote = await queryOne(`SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE cn.id = ?`, [req.params.id]) as any;
    if (!creditNote) return res.status(404).json({ error: "Credit note not found" });
    creditNote.items = await query(`SELECT cni.*, i.name as item_name, i.code as item_code FROM credit_note_items cni JOIN items i ON cni.item_id = i.id WHERE cni.credit_note_id = ?`, [req.params.id]);
    res.json(creditNote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { credit_note_date, sales_invoice_id, client_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const creditNoteNumber = await generateCodeAsync("CN", "credit_notes", "credit_note_number");
    const creditNoteId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      const result = await client.query(
        `INSERT INTO credit_notes (credit_note_number, credit_note_date, sales_invoice_id, client_id, reason, subtotal, tax, total, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [creditNoteNumber, credit_note_date, sales_invoice_id || null, client_id || null, reason || null, subtotal, Number(tax), total, req.user!.id]
      );
      const cnId = result.rows[0].id;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO credit_note_items (credit_note_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [cnId, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (client_id) {
        await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [total, client_id]);
      }
      if (sales_invoice_id) {
        await client.query("UPDATE sales_invoices SET remaining_amount = remaining_amount - $1 WHERE id = $2", [total, sales_invoice_id]);
      }
      return cnId;
    });
    void logActivityAsync(req.user!.id, "create_credit_note", "credit_note", creditNoteId as number);
    res.json({ message: "Credit note created", id: creditNoteId, credit_note_number: creditNoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, credit_note_date, sales_invoice_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const existing = await queryOne("SELECT * FROM credit_notes WHERE id = ?", [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: "Credit note not found" });
    const oldItems = await query("SELECT * FROM credit_note_items WHERE credit_note_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const oldItem of oldItems) {
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [oldItem.quantity, oldItem.item_id]);
      }
      if (existing.client_id) {
        await client.query("UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2", [existing.total, existing.client_id]);
      }
      if (existing.sales_invoice_id) {
        await client.query("UPDATE sales_invoices SET remaining_amount = remaining_amount + $1 WHERE id = $2", [existing.total, existing.sales_invoice_id]);
      }
      await client.query("DELETE FROM credit_note_items WHERE credit_note_id = $1", [req.params.id]);
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      await client.query(`UPDATE credit_notes SET client_id = $1, credit_note_date = $2, sales_invoice_id = $3, reason = $4, subtotal = $5, tax = $6, total = $7 WHERE id = $8`,
        [client_id || null, credit_note_date, sales_invoice_id || null, reason || null, subtotal, Number(tax), total, req.params.id]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO credit_note_items (credit_note_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (client_id) {
        await client.query("UPDATE clients SET current_balance = current_balance - $1 WHERE id = $2", [total, client_id]);
      }
      if (sales_invoice_id) {
        await client.query("UPDATE sales_invoices SET remaining_amount = remaining_amount - $1 WHERE id = $2", [total, sales_invoice_id]);
      }
    });
    void logActivityAsync(req.user!.id, "update_credit_note", "credit_note", parseInt(req.params.id));
    const updated = await queryOne(`SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE cn.id = ?`, [req.params.id]) as any;
    updated.items = await query(`SELECT cni.*, i.name as item_name, i.code as item_code FROM credit_note_items cni JOIN items i ON cni.item_id = i.id WHERE cni.credit_note_id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const creditNote = await queryOne("SELECT * FROM credit_notes WHERE id = ?", [req.params.id]) as any;
    if (!creditNote) return res.status(404).json({ error: "Credit note not found" });
    const items = await query("SELECT * FROM credit_note_items WHERE credit_note_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (creditNote.client_id) {
        await client.query("UPDATE clients SET current_balance = current_balance + $1 WHERE id = $2", [creditNote.total, creditNote.client_id]);
      }
      if (creditNote.sales_invoice_id) {
        await client.query("UPDATE sales_invoices SET remaining_amount = remaining_amount + $1 WHERE id = $2", [creditNote.total, creditNote.sales_invoice_id]);
      }
      await client.query("DELETE FROM credit_note_items WHERE credit_note_id = $1", [req.params.id]);
      await client.query("DELETE FROM credit_notes WHERE id = $1", [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "delete_credit_note", "credit_note", parseInt(req.params.id));
    res.json({ message: "Credit note deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
