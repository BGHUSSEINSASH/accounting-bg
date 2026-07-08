import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/movements/all', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT sm.*, i.name as item_name FROM stock_movements sm LEFT JOIN items i ON sm.item_id = i.id WHERE 1=1";
    const params: any[] = [];
    if (type) { query += " AND sm.movement_type = ?"; params.push(type); }
    const total = (db.prepare(query.replace("sm.*, i.name as item_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY sm.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const movements = db.prepare(query).all(...params);
    res.json({ movements, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const warehouses = db.prepare("SELECT id, code, name, location, phone, is_active FROM warehouses WHERE is_active = 1 ORDER BY name").all();
    res.json(warehouses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const warehouse = db.prepare("SELECT * FROM warehouses WHERE id = ?").get(req.params.id) as any;
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    warehouse.items = db.prepare("SELECT wi.*, i.name as item_name, i.code as item_code FROM warehouse_items wi JOIN items i ON wi.item_id = i.id WHERE wi.warehouse_id = ?").all(req.params.id);
    res.json(warehouse);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, location, phone } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const db = getDatabase();
    const code = generateCode("WH-", "warehouses");
    db.prepare("INSERT INTO warehouses (code, name, location, phone) VALUES (?, ?, ?, ?)").run(code, name, location || null, phone || null);
    logActivity(req.user!.id, "create_warehouse", "warehouse");
    res.json({ message: "Warehouse created", code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, location, phone, is_active } = req.body;
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(req.params.id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    db.prepare("UPDATE warehouses SET name = COALESCE(?, name), location = COALESCE(?, location), phone = COALESCE(?, phone), is_active = COALESCE(?, is_active) WHERE id = ?")
      .run(name, location, phone, is_active, req.params.id);
    logActivity(req.user!.id, "update_warehouse", "warehouse", parseInt(req.params.id));
    res.json({ message: "Warehouse updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(req.params.id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    db.prepare("UPDATE warehouses SET is_active = 0 WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_warehouse", "warehouse", parseInt(req.params.id));
    res.json({ message: "Warehouse deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/items', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(req.params.id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const items = db.prepare("SELECT wi.*, i.name as item_name, i.code as item_code FROM warehouse_items wi JOIN items i ON wi.item_id = i.id WHERE wi.warehouse_id = ? ORDER BY i.name").all(req.params.id);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/items', (req: AuthRequest, res: Response) => {
  try {
    const { item_id, quantity } = req.body;
    if (!item_id || quantity == null) return res.status(400).json({ error: "item_id and quantity are required" });
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(req.params.id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const item = db.prepare("SELECT id FROM items WHERE id = ? AND is_active = 1").get(item_id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    db.prepare("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, ?) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = ?")
      .run(req.params.id, item_id, quantity, quantity);
    db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?").run(item_id, item_id);
    db.prepare("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, created_by) VALUES (?, ?, 'in', ?, 'manual', ?)").run(item_id, req.params.id, quantity, req.user!.id);
    logActivity(req.user!.id, "add_warehouse_item", "warehouse_item");
    res.json({ message: "Item added to warehouse" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/items/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(req.params.id);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const result = db.prepare("DELETE FROM warehouse_items WHERE warehouse_id = ? AND item_id = ?").run(req.params.id, req.params.itemId);
    if (result.changes === 0) return res.status(404).json({ error: "Item not found in warehouse" });
    db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?").run(req.params.itemId, req.params.itemId);
    logActivity(req.user!.id, "remove_warehouse_item", "warehouse_item");
    res.json({ message: "Item removed from warehouse" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/transfer', (req: AuthRequest, res: Response) => {
  try {
    const { to_warehouse_id, item_id, quantity } = req.body;
    if (!to_warehouse_id || !item_id || !quantity) return res.status(400).json({ error: "to_warehouse_id, item_id, and quantity are required" });
    if (Number(req.params.id) === Number(to_warehouse_id)) return res.status(400).json({ error: "Source and target warehouses must be different" });
    const db = getDatabase();
    const fromWarehouse = db.prepare("SELECT id FROM warehouses WHERE id = ? AND is_active = 1").get(req.params.id);
    if (!fromWarehouse) return res.status(404).json({ error: "Source warehouse not found" });
    const toWarehouse = db.prepare("SELECT id FROM warehouses WHERE id = ? AND is_active = 1").get(to_warehouse_id);
    if (!toWarehouse) return res.status(404).json({ error: "Target warehouse not found" });
    const sourceItem = db.prepare("SELECT quantity FROM warehouse_items WHERE warehouse_id = ? AND item_id = ?").get(req.params.id, item_id) as any;
    if (!sourceItem || sourceItem.quantity < quantity) return res.status(400).json({ error: "Insufficient quantity in source warehouse" });
    const trx = db.transaction(() => {
      db.prepare("UPDATE warehouse_items SET quantity = quantity - ? WHERE warehouse_id = ? AND item_id = ?").run(quantity, req.params.id, item_id);
      db.prepare("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, ?) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = quantity + ?")
        .run(to_warehouse_id, item_id, quantity, quantity);
      db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?").run(item_id, item_id);
      db.prepare("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by, notes) VALUES (?, ?, 'transfer_out', ?, 'transfer', ?, ?, ?)")
        .run(item_id, req.params.id, quantity, req.params.id, req.user!.id, `Transfer to warehouse #${to_warehouse_id}`);
      db.prepare("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by, notes) VALUES (?, ?, 'transfer_in', ?, 'transfer', ?, ?, ?)")
        .run(item_id, to_warehouse_id, quantity, to_warehouse_id, req.user!.id, `Transfer from warehouse #${req.params.id}`);
    });
    trx();
    logActivity(req.user!.id, "transfer_items", "transfer", parseInt(req.params.id), `Transferred ${quantity} of item #${item_id} to warehouse #${to_warehouse_id}`);
    res.json({ message: "Items transferred successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
