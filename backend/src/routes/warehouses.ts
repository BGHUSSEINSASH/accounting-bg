import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/movements/all', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT sm.*, i.name as item_name FROM stock_movements sm LEFT JOIN items i ON sm.item_id = i.id WHERE 1=1";
    const params: any[] = [];
    if (type) { sql += " AND sm.movement_type = ?"; params.push(type); }
    const countRow = await queryOne(sql.replace("sm.*, i.name as item_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY sm.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const movements = await query(sql, params);
    res.json({ movements, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const warehouses = await query("SELECT id, code, name, location, phone, is_active FROM warehouses WHERE is_active = 1 ORDER BY name");
    res.json(warehouses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ?", [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const items = await query("SELECT wi.*, i.name as item_name, i.code as item_code FROM warehouse_items wi JOIN items i ON wi.item_id = i.id WHERE wi.warehouse_id = ? ORDER BY i.name", [req.params.id]);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const warehouse = await queryOne("SELECT * FROM warehouses WHERE id = ?", [req.params.id]) as any;
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    warehouse.items = await query("SELECT wi.*, i.name as item_name, i.code as item_code FROM warehouse_items wi JOIN items i ON wi.item_id = i.id WHERE wi.warehouse_id = ?", [req.params.id]);
    res.json(warehouse);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, location, phone } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const code = await generateCodeAsync("WH-", "warehouses");
    await execute("INSERT INTO warehouses (code, name, location, phone) VALUES (?, ?, ?, ?)", [code, name, location || null, phone || null]);
    void logActivityAsync(req.user!.id, "create_warehouse", "warehouse");
    res.json({ message: "Warehouse created", code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, location, phone, is_active } = req.body;
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ?", [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    await execute("UPDATE warehouses SET name = COALESCE(?, name), location = COALESCE(?, location), phone = COALESCE(?, phone), is_active = COALESCE(?, is_active) WHERE id = ?",
      [name, location, phone, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, "update_warehouse", "warehouse", parseInt(req.params.id));
    res.json({ message: "Warehouse updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ?", [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    await execute("UPDATE warehouses SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_warehouse", "warehouse", parseInt(req.params.id));
    res.json({ message: "Warehouse deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, quantity } = req.body;
    if (!item_id || quantity == null) return res.status(400).json({ error: "item_id and quantity are required" });
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ?", [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const item = await queryOne("SELECT id FROM items WHERE id = ? AND is_active = 1", [item_id]);
    if (!item) return res.status(404).json({ error: "Item not found" });
    await execute("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, ?) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = ?",
      [req.params.id, item_id, quantity, quantity]);
    await execute("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?", [item_id, item_id]);
    await execute("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, created_by) VALUES (?, ?, 'in', ?, 'manual', ?)", [item_id, req.params.id, quantity, req.user!.id]);
    void logActivityAsync(req.user!.id, "add_warehouse_item", "warehouse_item");
    res.json({ message: "Item added to warehouse" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/items/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ?", [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const result = await execute("DELETE FROM warehouse_items WHERE warehouse_id = ? AND item_id = ?", [req.params.id, req.params.itemId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Item not found in warehouse" });
    await execute("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?) WHERE id = ?", [req.params.itemId, req.params.itemId]);
    void logActivityAsync(req.user!.id, "remove_warehouse_item", "warehouse_item");
    res.json({ message: "Item removed from warehouse" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/transfer', async (req: AuthRequest, res: Response) => {
  try {
    const { to_warehouse_id, item_id, quantity } = req.body;
    if (!to_warehouse_id || !item_id || !quantity) return res.status(400).json({ error: "to_warehouse_id, item_id, and quantity are required" });
    if (Number(req.params.id) === Number(to_warehouse_id)) return res.status(400).json({ error: "Source and target warehouses must be different" });
    const fromWarehouse = await queryOne("SELECT id FROM warehouses WHERE id = ? AND is_active = 1", [req.params.id]);
    if (!fromWarehouse) return res.status(404).json({ error: "Source warehouse not found" });
    const toWarehouse = await queryOne("SELECT id FROM warehouses WHERE id = ? AND is_active = 1", [to_warehouse_id]);
    if (!toWarehouse) return res.status(404).json({ error: "Target warehouse not found" });
    const sourceItem = await queryOne("SELECT quantity FROM warehouse_items WHERE warehouse_id = ? AND item_id = ?", [req.params.id, item_id]) as any;
    if (!sourceItem || sourceItem.quantity < quantity) return res.status(400).json({ error: "Insufficient quantity in source warehouse" });
    await withTransaction(async (client) => {
      await client.query("UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND item_id = $3", [quantity, req.params.id, item_id]);
      await client.query("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES ($1,$2,$3) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = warehouse_items.quantity + $3",
        [to_warehouse_id, item_id, quantity]);
      await client.query("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = $1) WHERE id = $1", [item_id]);
      await client.query("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by, notes) VALUES ($1,$2,'transfer_out',$3,'transfer',$4,$5,$6)",
        [item_id, req.params.id, quantity, req.params.id, req.user!.id, `Transfer to warehouse #${to_warehouse_id}`]);
      await client.query("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by, notes) VALUES ($1,$2,'transfer_in',$3,'transfer',$4,$5,$6)",
        [item_id, to_warehouse_id, quantity, to_warehouse_id, req.user!.id, `Transfer from warehouse #${req.params.id}`]);
    });
    void logActivityAsync(req.user!.id, "transfer_items", "transfer", parseInt(req.params.id), `Transferred ${quantity} of item #${item_id} to warehouse #${to_warehouse_id}`);
    res.json({ message: "Items transferred successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
