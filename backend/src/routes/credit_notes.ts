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
    const { page = 1, limit = 20, client_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE 1=1`;
    const params: any[] = [];
    if (client_id) { query += " AND cn.client_id = ?"; params.push(client_id); }
    const total = (db.prepare(query.replace("cn.*, c.name as client_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY cn.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const creditNotes = db.prepare(query).all(...params);
    res.json({ credit_notes: creditNotes, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const creditNote = db.prepare(`SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE cn.id = ?`).get(req.params.id) as any;
    if (!creditNote) return res.status(404).json({ error: "Credit note not found" });
    creditNote.items = db.prepare(`SELECT cni.*, i.name as item_name, i.code as item_code FROM credit_note_items cni JOIN items i ON cni.item_id = i.id WHERE cni.credit_note_id = ?`).all(req.params.id);
    res.json(creditNote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { credit_note_date, sales_invoice_id, client_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const creditNoteNumber = generateCode("CN", "credit_notes", "credit_note_number");
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      const result = db.prepare(`INSERT INTO credit_notes (credit_note_number, credit_note_date, sales_invoice_id, client_id, reason, subtotal, tax, total, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        creditNoteNumber, credit_note_date, sales_invoice_id || null, client_id || null, reason || null, subtotal, Number(tax), total, req.user!.id);
      const creditNoteId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO credit_note_items (credit_note_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(creditNoteId, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.item_id);
      }
      if (client_id) {
        db.prepare("UPDATE clients SET current_balance = current_balance - ? WHERE id = ?").run(total, client_id);
      }
      if (sales_invoice_id) {
        db.prepare("UPDATE sales_invoices SET remaining_amount = remaining_amount - ? WHERE id = ?").run(total, sales_invoice_id);
      }
      return creditNoteId;
    });
    const creditNoteId = trx();
    logActivity(req.user!.id, "create_credit_note", "credit_note", creditNoteId as number);
    res.json({ message: "Credit note created", id: creditNoteId, credit_note_number: creditNoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { client_id, credit_note_date, sales_invoice_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Credit note not found" });
    const oldItems = db.prepare("SELECT * FROM credit_note_items WHERE credit_note_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const oldItem of oldItems) {
        db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?").run(oldItem.quantity, oldItem.item_id);
      }
      if (existing.client_id) {
        db.prepare("UPDATE clients SET current_balance = current_balance + ? WHERE id = ?").run(existing.total, existing.client_id);
      }
      if (existing.sales_invoice_id) {
        db.prepare("UPDATE sales_invoices SET remaining_amount = remaining_amount + ? WHERE id = ?").run(existing.total, existing.sales_invoice_id);
      }
      db.prepare("DELETE FROM credit_note_items WHERE credit_note_id = ?").run(req.params.id);
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      db.prepare(`UPDATE credit_notes SET client_id = ?, credit_note_date = ?, sales_invoice_id = ?, reason = ?, subtotal = ?, tax = ?, total = ? WHERE id = ?`).run(
        client_id || null, credit_note_date, sales_invoice_id || null, reason || null, subtotal, Number(tax), total, req.params.id);
      const insertItem = db.prepare("INSERT INTO credit_note_items (credit_note_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.item_id);
      }
      if (client_id) {
        db.prepare("UPDATE clients SET current_balance = current_balance - ? WHERE id = ?").run(total, client_id);
      }
      if (sales_invoice_id) {
        db.prepare("UPDATE sales_invoices SET remaining_amount = remaining_amount - ? WHERE id = ?").run(total, sales_invoice_id);
      }
    });
    trx();
    logActivity(req.user!.id, "update_credit_note", "credit_note", parseInt(req.params.id));
    const updated = db.prepare(`SELECT cn.*, c.name as client_name FROM credit_notes cn LEFT JOIN clients c ON cn.client_id = c.id WHERE cn.id = ?`).get(req.params.id) as any;
    updated.items = db.prepare(`SELECT cni.*, i.name as item_name, i.code as item_code FROM credit_note_items cni JOIN items i ON cni.item_id = i.id WHERE cni.credit_note_id = ?`).all(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(req.params.id) as any;
    if (!creditNote) return res.status(404).json({ error: "Credit note not found" });
    const items = db.prepare("SELECT * FROM credit_note_items WHERE credit_note_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const item of items) {
        db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?").run(item.quantity, item.item_id);
      }
      if (creditNote.client_id) {
        db.prepare("UPDATE clients SET current_balance = current_balance + ? WHERE id = ?").run(creditNote.total, creditNote.client_id);
      }
      if (creditNote.sales_invoice_id) {
        db.prepare("UPDATE sales_invoices SET remaining_amount = remaining_amount + ? WHERE id = ?").run(creditNote.total, creditNote.sales_invoice_id);
      }
      db.prepare("DELETE FROM credit_note_items WHERE credit_note_id = ?").run(req.params.id);
      db.prepare("DELETE FROM credit_notes WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "delete_credit_note", "credit_note", parseInt(req.params.id));
    res.json({ message: "Credit note deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
