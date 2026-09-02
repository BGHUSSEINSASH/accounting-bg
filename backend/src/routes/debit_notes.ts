import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, supplier_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE 1=1`;
    const params: any[] = [];
    if (supplier_id) { sql += " AND dn.supplier_id = ?"; params.push(supplier_id); }
    const countRow = await queryOne(sql.replace("dn.*, s.name as supplier_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY dn.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const debitNotes = await query(sql, params);
    res.json({ debit_notes: debitNotes, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const debitNote = await queryOne(`SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE dn.id = ?`, [req.params.id]) as any;
    if (!debitNote) return res.status(404).json({ error: "Debit note not found" });
    debitNote.items = await query(`SELECT dni.*, i.name as item_name, i.code as item_code FROM debit_note_items dni JOIN items i ON dni.item_id = i.id WHERE dni.debit_note_id = ?`, [req.params.id]);
    res.json(debitNote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { debit_note_date, purchase_invoice_id, supplier_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const debitNoteNumber = await generateCodeAsync("DN", "debit_notes", "debit_note_number");
    const debitNoteId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      const result = await client.query(
        `INSERT INTO debit_notes (debit_note_number, debit_note_date, purchase_invoice_id, supplier_id, reason, subtotal, tax, total, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [debitNoteNumber, debit_note_date, purchase_invoice_id || null, supplier_id || null, reason || null, subtotal, Number(tax), total, req.user!.id]
      );
      const dnId = result.rows[0].id;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO debit_note_items (debit_note_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [dnId, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (supplier_id) {
        await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [total, supplier_id]);
      }
      return dnId;
    });
    void logActivityAsync(req.user!.id, "create_debit_note", "debit_note", debitNoteId as number);
    res.json({ message: "Debit note created", id: debitNoteId, debit_note_number: debitNoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, debit_note_date, purchase_invoice_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const existing = await queryOne("SELECT * FROM debit_notes WHERE id = ?", [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: "Debit note not found" });
    const oldItems = await query("SELECT * FROM debit_note_items WHERE debit_note_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const oldItem of oldItems) {
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [oldItem.quantity, oldItem.item_id]);
      }
      if (existing.supplier_id) {
        await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [existing.total, existing.supplier_id]);
      }
      await client.query("DELETE FROM debit_note_items WHERE debit_note_id = $1", [req.params.id]);
      let subtotal = 0;
      for (const item of items) {
        const itemData = await client.query("SELECT * FROM items WHERE id = $1", [item.item_id]).then(r => r.rows[0]);
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      await client.query(`UPDATE debit_notes SET supplier_id = $1, debit_note_date = $2, purchase_invoice_id = $3, reason = $4, subtotal = $5, tax = $6, total = $7 WHERE id = $8`,
        [supplier_id || null, debit_note_date, purchase_invoice_id || null, reason || null, subtotal, Number(tax), total, req.params.id]);
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO debit_note_items (debit_note_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal]);
        await client.query("UPDATE items SET current_quantity = current_quantity - $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (supplier_id) {
        await client.query("UPDATE suppliers SET current_balance = current_balance - $1 WHERE id = $2", [total, supplier_id]);
      }
    });
    void logActivityAsync(req.user!.id, "update_debit_note", "debit_note", parseInt(req.params.id));
    const updated = await queryOne(`SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE dn.id = ?`, [req.params.id]) as any;
    updated.items = await query(`SELECT dni.*, i.name as item_name, i.code as item_code FROM debit_note_items dni JOIN items i ON dni.item_id = i.id WHERE dni.debit_note_id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const debitNote = await queryOne("SELECT * FROM debit_notes WHERE id = ?", [req.params.id]) as any;
    if (!debitNote) return res.status(404).json({ error: "Debit note not found" });
    const items = await query("SELECT * FROM debit_note_items WHERE debit_note_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query("UPDATE items SET current_quantity = current_quantity + $1 WHERE id = $2", [item.quantity, item.item_id]);
      }
      if (debitNote.supplier_id) {
        await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [debitNote.total, debitNote.supplier_id]);
      }
      await client.query("DELETE FROM debit_note_items WHERE debit_note_id = $1", [req.params.id]);
      await client.query("DELETE FROM debit_notes WHERE id = $1", [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "delete_debit_note", "debit_note", parseInt(req.params.id));
    res.json({ message: "Debit note deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
