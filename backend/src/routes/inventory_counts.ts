import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT ic.*, w.name as warehouse_name, u.full_name as created_by_name FROM inventory_counts ic LEFT JOIN warehouses w ON ic.warehouse_id = w.id LEFT JOIN users u ON ic.created_by = u.id WHERE 1=1";
    const params: any[] = [];
    if (status) { query += " AND ic.status = ?"; params.push(status); }
    const total = (db.prepare(query.replace("ic.*, w.name as warehouse_name, u.full_name as created_by_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY ic.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const counts = db.prepare(query).all(...params);
    res.json({ counts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const count = db.prepare("SELECT ic.*, w.name as warehouse_name, u.full_name as created_by_name, au.full_name as approved_by_name FROM inventory_counts ic LEFT JOIN warehouses w ON ic.warehouse_id = w.id LEFT JOIN users u ON ic.created_by = u.id LEFT JOIN users au ON ic.approved_by = au.id WHERE ic.id = ?").get(req.params.id) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    count.items = db.prepare("SELECT ici.*, i.name as item_name, i.code as item_code, COALESCE((SELECT quantity FROM warehouse_items WHERE warehouse_id = ? AND item_id = ici.item_id), 0) as current_system_quantity FROM inventory_count_items ici LEFT JOIN items i ON ici.item_id = i.id WHERE ici.inventory_count_id = ?")
      .all(count.warehouse_id, req.params.id);
    for (const item of count.items) {
      item.system_quantity = item.current_system_quantity;
    }
    res.json(count);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { warehouse_id, count_date, notes } = req.body;
    if (!warehouse_id || !count_date) return res.status(400).json({ error: "warehouse_id and count_date are required" });
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ? AND is_active = 1").get(warehouse_id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const warehouseItems = db.prepare("SELECT wi.item_id, wi.quantity FROM warehouse_items wi WHERE wi.warehouse_id = ?").all(warehouse_id) as any[];
    if (!warehouseItems.length) return res.status(400).json({ error: "Warehouse has no items" });
    let countId: number;
    const trx = db.transaction(() => {
      const result = db.prepare("INSERT INTO inventory_counts (warehouse_id, count_date, notes, created_by, status) VALUES (?, ?, ?, ?, 'draft')").run(warehouse_id, count_date, notes || null, req.user!.id);
      countId = result.lastInsertRowid as number;
      const insertItem = db.prepare("INSERT INTO inventory_count_items (inventory_count_id, item_id, system_quantity, actual_quantity, difference) VALUES (?, ?, ?, 0, ?)");
      for (const wi of warehouseItems) {
        insertItem.run(countId, wi.item_id, wi.quantity, -wi.quantity);
      }
    });
    trx();
    logActivity(req.user!.id, "create_inventory_count", "inventory_count", countId!);
    res.json({ id: countId!, message: "Inventory count created" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { notes, status } = req.body;
    const db = getDatabase();
    const count = db.prepare("SELECT * FROM inventory_counts WHERE id = ?").get(req.params.id) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (status === "completed" && count.status !== "in_progress" && count.status !== "draft") return res.status(400).json({ error: "Count must be draft or in_progress to complete" });
    if (status === "approved" && count.status !== "completed") return res.status(400).json({ error: "Count must be completed before approval" });

    if (status === "completed") {
      db.prepare("UPDATE inventory_count_items SET difference = actual_quantity - system_quantity WHERE inventory_count_id = ?").run(req.params.id);
    }

    if (status === "approved") {
      const items = db.prepare("SELECT * FROM inventory_count_items WHERE inventory_count_id = ?").all(req.params.id) as any[];
      const trx = db.transaction(() => {
        for (const item of items) {
          db.prepare("UPDATE warehouse_items SET quantity = ? WHERE warehouse_id = ? AND item_id = ?").run(item.actual_quantity, count.warehouse_id, item.item_id);
          db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?").run(item.item_id, item.item_id);
        }
        db.prepare("UPDATE inventory_counts SET notes = COALESCE(?, notes), status = COALESCE(?, status), approved_by = ? WHERE id = ?").run(notes, status, req.user!.id, req.params.id);
      });
      trx();
      logActivity(req.user!.id, "approve_inventory_count", "inventory_count", parseInt(req.params.id));
    } else {
      db.prepare("UPDATE inventory_counts SET notes = COALESCE(?, notes), status = COALESCE(?, status) WHERE id = ?").run(notes, status, req.params.id);
      logActivity(req.user!.id, "update_inventory_count", "inventory_count", parseInt(req.params.id));
    }
    res.json({ message: "Inventory count updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/items/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const { actual_quantity, notes } = req.body;
    if (actual_quantity == null) return res.status(400).json({ error: "actual_quantity is required" });
    const db = getDatabase();
    const count = db.prepare("SELECT id, status FROM inventory_counts WHERE id = ?").get(req.params.id) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status === "completed" || count.status === "approved") return res.status(400).json({ error: "Cannot modify a completed or approved count" });
    const item = db.prepare("SELECT system_quantity FROM inventory_count_items WHERE inventory_count_id = ? AND id = ?").get(req.params.id, req.params.itemId) as any;
    if (!item) return res.status(404).json({ error: "Count item not found" });
    const difference = Number(actual_quantity) - item.system_quantity;
    db.prepare("UPDATE inventory_count_items SET actual_quantity = ?, difference = ?, notes = COALESCE(?, notes) WHERE id = ?").run(actual_quantity, difference, notes, req.params.itemId);
    logActivity(req.user!.id, "update_count_item", "inventory_count_item", parseInt(req.params.itemId));
    res.json({ message: "Count item updated", difference });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const count = db.prepare("SELECT id, status FROM inventory_counts WHERE id = ?").get(req.params.id) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status === "completed" || count.status === "approved") return res.status(400).json({ error: "Cannot delete a completed or approved count" });
    db.prepare("DELETE FROM inventory_counts WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_inventory_count", "inventory_count", parseInt(req.params.id));
    res.json({ message: "Inventory count deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const count = db.prepare("SELECT * FROM inventory_counts WHERE id = ?").get(req.params.id) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status !== "completed") return res.status(400).json({ error: "Count must be completed before approval" });
    const items = db.prepare("SELECT * FROM inventory_count_items WHERE inventory_count_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      for (const item of items) {
        db.prepare("UPDATE warehouse_items SET quantity = ? WHERE warehouse_id = ? AND item_id = ?").run(item.actual_quantity, count.warehouse_id, item.item_id);
        db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?").run(item.item_id, item.item_id);
      }
      db.prepare("UPDATE inventory_counts SET status = 'approved', approved_by = ? WHERE id = ?").run(req.user!.id, req.params.id);
    });
    trx();
    logActivity(req.user!.id, "approve_inventory_count", "inventory_count", parseInt(req.params.id));
    res.json({ message: "Inventory count approved and inventory updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
