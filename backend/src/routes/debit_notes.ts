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
    const { page = 1, limit = 20, supplier_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE 1=1`;
    const params: any[] = [];
    if (supplier_id) { query += " AND dn.supplier_id = ?"; params.push(supplier_id); }
    const total = (db.prepare(query.replace("dn.*, s.name as supplier_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY dn.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const debitNotes = db.prepare(query).all(...params);
    res.json({ debit_notes: debitNotes, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const debitNote = db.prepare(`SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE dn.id = ?`).get(req.params.id) as any;
    if (!debitNote) return res.status(404).json({ error: "Debit note not found" });
    debitNote.items = db.prepare(`SELECT dni.*, i.name as item_name, i.code as item_code FROM debit_note_items dni JOIN items i ON dni.item_id = i.id WHERE dni.debit_note_id = ?`).all(req.params.id);
    res.json(debitNote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { debit_note_date, purchase_invoice_id, supplier_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const debitNoteNumber = generateCode("DN", "debit_notes", "debit_note_number");
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      const result = db.prepare(`INSERT INTO debit_notes (debit_note_number, debit_note_date, purchase_invoice_id, supplier_id, reason, subtotal, tax, total, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        debitNoteNumber, debit_note_date, purchase_invoice_id || null, supplier_id || null, reason || null, subtotal, Number(tax), total, req.user!.id);
      const debitNoteId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO debit_note_items (debit_note_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(debitNoteId, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.item_id);
      }
      if (supplier_id) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?").run(total, supplier_id);
      }
      return debitNoteId;
    });
    const debitNoteId = trx();
    logActivity(req.user!.id, "create_debit_note", "debit_note", debitNoteId as number);
    res.json({ message: "Debit note created", id: debitNoteId, debit_note_number: debitNoteNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, debit_note_date, purchase_invoice_id, reason, items, tax = 0 } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM debit_notes WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Debit note not found" });
    const oldItems = db.prepare("SELECT * FROM debit_note_items WHERE debit_note_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const oldItem of oldItems) {
        db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?").run(oldItem.quantity, oldItem.item_id);
      }
      if (existing.supplier_id) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?").run(existing.total, existing.supplier_id);
      }
      db.prepare("DELETE FROM debit_note_items WHERE debit_note_id = ?").run(req.params.id);
      let subtotal = 0;
      for (const item of items) {
        const itemData = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id) as any;
        if (!itemData) throw new Error(`Item ${item.item_id} not found`);
        subtotal += item.quantity * item.unit_price;
      }
      const total = subtotal + Number(tax);
      db.prepare(`UPDATE debit_notes SET supplier_id = ?, debit_note_date = ?, purchase_invoice_id = ?, reason = ?, subtotal = ?, tax = ?, total = ? WHERE id = ?`).run(
        supplier_id || null, debit_note_date, purchase_invoice_id || null, reason || null, subtotal, Number(tax), total, req.params.id);
      const insertItem = db.prepare("INSERT INTO debit_note_items (debit_note_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      const updateQty = db.prepare("UPDATE items SET current_quantity = current_quantity - ? WHERE id = ?");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(req.params.id, item.item_id, item.quantity, item.unit_price, itemTotal);
        updateQty.run(item.quantity, item.item_id);
      }
      if (supplier_id) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?").run(total, supplier_id);
      }
    });
    trx();
    logActivity(req.user!.id, "update_debit_note", "debit_note", parseInt(req.params.id));
    const updated = db.prepare(`SELECT dn.*, s.name as supplier_name FROM debit_notes dn LEFT JOIN suppliers s ON dn.supplier_id = s.id WHERE dn.id = ?`).get(req.params.id) as any;
    updated.items = db.prepare(`SELECT dni.*, i.name as item_name, i.code as item_code FROM debit_note_items dni JOIN items i ON dni.item_id = i.id WHERE dni.debit_note_id = ?`).all(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const debitNote = db.prepare("SELECT * FROM debit_notes WHERE id = ?").get(req.params.id) as any;
    if (!debitNote) return res.status(404).json({ error: "Debit note not found" });
    const items = db.prepare("SELECT * FROM debit_note_items WHERE debit_note_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const item of items) {
        db.prepare("UPDATE items SET current_quantity = current_quantity + ? WHERE id = ?").run(item.quantity, item.item_id);
      }
      if (debitNote.supplier_id) {
        db.prepare("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?").run(debitNote.total, debitNote.supplier_id);
      }
      db.prepare("DELETE FROM debit_note_items WHERE debit_note_id = ?").run(req.params.id);
      db.prepare("DELETE FROM debit_notes WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "delete_debit_note", "debit_note", parseInt(req.params.id));
    res.json({ message: "Debit note deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
