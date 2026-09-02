import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT ic.*, w.name as warehouse_name, u.full_name as created_by_name FROM inventory_counts ic LEFT JOIN warehouses w ON ic.warehouse_id = w.id LEFT JOIN users u ON ic.created_by = u.id WHERE 1=1";
    const params: any[] = [];
    if (status) { sql += " AND ic.status = ?"; params.push(status); }
    const countRow = await queryOne(sql.replace("ic.*, w.name as warehouse_name, u.full_name as created_by_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY ic.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const counts = await query(sql, params);
    res.json({ counts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const count = await queryOne("SELECT ic.*, w.name as warehouse_name, u.full_name as created_by_name, au.full_name as approved_by_name FROM inventory_counts ic LEFT JOIN warehouses w ON ic.warehouse_id = w.id LEFT JOIN users u ON ic.created_by = u.id LEFT JOIN users au ON ic.approved_by = au.id WHERE ic.id = ?", [req.params.id]) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    count.items = await query("SELECT ici.*, i.name as item_name, i.code as item_code, COALESCE((SELECT quantity FROM warehouse_items WHERE warehouse_id = ? AND item_id = ici.item_id), 0) as current_system_quantity FROM inventory_count_items ici LEFT JOIN items i ON ici.item_id = i.id WHERE ici.inventory_count_id = ?",
      [count.warehouse_id, req.params.id]);
    for (const item of count.items) { item.system_quantity = item.current_system_quantity; }
    res.json(count);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { warehouse_id, count_date, notes } = req.body;
    if (!warehouse_id || !count_date) return res.status(400).json({ error: "warehouse_id and count_date are required" });
    const warehouse = await queryOne("SELECT id FROM warehouses WHERE id = ? AND is_active = 1", [warehouse_id]);
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    const warehouseItems = await query("SELECT wi.item_id, wi.quantity FROM warehouse_items wi WHERE wi.warehouse_id = ?", [warehouse_id]) as any[];
    if (!warehouseItems.length) return res.status(400).json({ error: "Warehouse has no items" });
    const countId = await withTransaction(async (client) => {
      const result = await client.query("INSERT INTO inventory_counts (warehouse_id, count_date, notes, created_by, status) VALUES ($1,$2,$3,$4,'draft') RETURNING id",
        [warehouse_id, count_date, notes || null, req.user!.id]);
      const cid = result.rows[0].id;
      for (const wi of warehouseItems) {
        await client.query("INSERT INTO inventory_count_items (inventory_count_id, item_id, system_quantity, actual_quantity, difference) VALUES ($1,$2,$3,0,$4)",
          [cid, wi.item_id, wi.quantity, -wi.quantity]);
      }
      return cid;
    });
    void logActivityAsync(req.user!.id, "create_inventory_count", "inventory_count", countId as number);
    res.json({ id: countId, message: "Inventory count created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { notes, status } = req.body;
    const count = await queryOne("SELECT * FROM inventory_counts WHERE id = ?", [req.params.id]) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (status === "completed" && count.status !== "in_progress" && count.status !== "draft") return res.status(400).json({ error: "Count must be draft or in_progress to complete" });
    if (status === "approved" && count.status !== "completed") return res.status(400).json({ error: "Count must be completed before approval" });
    if (status === "completed") {
      await execute("UPDATE inventory_count_items SET difference = actual_quantity - system_quantity WHERE inventory_count_id = ?", [req.params.id]);
    }
    if (status === "approved") {
      const items = await query("SELECT * FROM inventory_count_items WHERE inventory_count_id = ?", [req.params.id]) as any[];
      await withTransaction(async (client) => {
        for (const item of items) {
          await client.query("UPDATE warehouse_items SET quantity = $1 WHERE warehouse_id = $2 AND item_id = $3", [item.actual_quantity, count.warehouse_id, item.item_id]);
          await client.query("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = $1) WHERE id = $1", [item.item_id]);
        }
        await client.query("UPDATE inventory_counts SET notes = COALESCE($1, notes), status = COALESCE($2, status), approved_by = $3 WHERE id = $4",
          [notes, status, req.user!.id, req.params.id]);
      });
      void logActivityAsync(req.user!.id, "approve_inventory_count", "inventory_count", parseInt(req.params.id));
    } else {
      await execute("UPDATE inventory_counts SET notes = COALESCE(?, notes), status = COALESCE(?, status) WHERE id = ?", [notes, status, req.params.id]);
      void logActivityAsync(req.user!.id, "update_inventory_count", "inventory_count", parseInt(req.params.id));
    }
    res.json({ message: "Inventory count updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/items/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const { actual_quantity, notes } = req.body;
    if (actual_quantity == null) return res.status(400).json({ error: "actual_quantity is required" });
    const count = await queryOne("SELECT id, status FROM inventory_counts WHERE id = ?", [req.params.id]) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status === "completed" || count.status === "approved") return res.status(400).json({ error: "Cannot modify a completed or approved count" });
    const item = await queryOne("SELECT system_quantity FROM inventory_count_items WHERE inventory_count_id = ? AND id = ?", [req.params.id, req.params.itemId]) as any;
    if (!item) return res.status(404).json({ error: "Count item not found" });
    const difference = Number(actual_quantity) - item.system_quantity;
    await execute("UPDATE inventory_count_items SET actual_quantity = ?, difference = ?, notes = COALESCE(?, notes) WHERE id = ?", [actual_quantity, difference, notes, req.params.itemId]);
    void logActivityAsync(req.user!.id, "update_count_item", "inventory_count_item", parseInt(req.params.itemId));
    res.json({ message: "Count item updated", difference });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const count = await queryOne("SELECT id, status FROM inventory_counts WHERE id = ?", [req.params.id]) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status === "completed" || count.status === "approved") return res.status(400).json({ error: "Cannot delete a completed or approved count" });
    await execute("DELETE FROM inventory_counts WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_inventory_count", "inventory_count", parseInt(req.params.id));
    res.json({ message: "Inventory count deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const count = await queryOne("SELECT * FROM inventory_counts WHERE id = ?", [req.params.id]) as any;
    if (!count) return res.status(404).json({ error: "Inventory count not found" });
    if (count.status !== "completed") return res.status(400).json({ error: "Count must be completed before approval" });
    const items = await query("SELECT * FROM inventory_count_items WHERE inventory_count_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query("UPDATE warehouse_items SET quantity = $1 WHERE warehouse_id = $2 AND item_id = $3", [item.actual_quantity, count.warehouse_id, item.item_id]);
        await client.query("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = $1) WHERE id = $1", [item.item_id]);
      }
      await client.query("UPDATE inventory_counts SET status = 'approved', approved_by = $1 WHERE id = $2", [req.user!.id, req.params.id]);
    });
    void logActivityAsync(req.user!.id, "approve_inventory_count", "inventory_count", parseInt(req.params.id));
    res.json({ message: "Inventory count approved and inventory updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
