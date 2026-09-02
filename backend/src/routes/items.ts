import { Router, Response } from 'express';
import { query, queryOne, execute, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search, category, low_stock } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT * FROM items WHERE is_active = 1";
    const params: any[] = [];
    if (search) { sql += " AND (name LIKE ? OR code LIKE ? OR barcode LIKE ?)"; params.push("%" + search + "%", "%" + search + "%", "%" + search + "%"); }
    if (category) { sql += " AND category = ?"; params.push(category); }
    if (low_stock === 'true') { sql += " AND current_quantity <= min_quantity"; }
    const countRow = await queryOne(sql.replace("SELECT *", "SELECT COUNT(*) as total"), params);
    const total = countRow?.total ?? 0;
    sql += " ORDER BY name LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const items = await query(sql, params);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', async (_req: AuthRequest, res: Response) => {
  try {
    const items = await query("SELECT id, code, name, current_quantity, selling_price, purchase_price FROM items WHERE is_active = 1 ORDER BY name");
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/low-stock', async (_req: AuthRequest, res: Response) => {
  try {
    const items = await query("SELECT * FROM items WHERE is_active = 1 AND current_quantity <= min_quantity ORDER BY current_quantity ASC");
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/categories', async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await query("SELECT DISTINCT category FROM items WHERE category IS NOT NULL AND is_active = 1 ORDER BY category");
    res.json(categories.map((c: any) => c.category));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/stock', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM stock_movements WHERE item_id = ?", [req.params.id]);
    const total = countRow?.total ?? 0;
    const movements = await query("SELECT sm.*, u.full_name as created_by_name FROM stock_movements sm LEFT JOIN users u ON sm.created_by = u.id WHERE sm.item_id = ? ORDER BY sm.created_at DESC LIMIT ? OFFSET ?", [req.params.id, Number(limit), offset]);
    res.json({ movements, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/barcode', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ error: "Barcode is required" });
    await execute("UPDATE items SET barcode = ? WHERE id = ?", [barcode, req.params.id]);
    res.json({ message: "Barcode updated", barcode });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await queryOne("SELECT * FROM items WHERE id = ?", [req.params.id]) as any;
    if (!item) return res.status(404).json({ error: "Item not found" });
    item.warehouses = await query("SELECT wi.*, w.name as warehouse_name FROM warehouse_items wi JOIN warehouses w ON wi.warehouse_id = w.id WHERE wi.item_id = ? AND w.is_active = 1", [req.params.id]);
    item.prices = await query("SELECT * FROM item_prices WHERE item_id = ? AND is_active = 1", [req.params.id]);
    res.json(item);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en, category, unit, purchase_price, selling_price, current_quantity, min_quantity, max_quantity, barcode } = req.body;
    const code = await generateCodeAsync('ITM', 'items');
    await execute("INSERT INTO items (code, name, name_en, category, unit, purchase_price, selling_price, current_quantity, min_quantity, max_quantity, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [code, name, name_en || null, category || null, unit || 'قطعة', purchase_price || 0, selling_price || 0, current_quantity || 0, min_quantity || 5, max_quantity || 100, barcode || null]);
    void logActivityAsync(req.user!.id, 'create_item', 'item');
    res.json({ message: 'Item created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en, category, unit, purchase_price, selling_price, current_quantity, min_quantity, max_quantity, barcode, is_active } = req.body;
    await execute("UPDATE items SET name = COALESCE(?, name), name_en = COALESCE(?, name_en), category = COALESCE(?, category), unit = COALESCE(?, unit), purchase_price = COALESCE(?, purchase_price), selling_price = COALESCE(?, selling_price), current_quantity = COALESCE(?, current_quantity), min_quantity = COALESCE(?, min_quantity), max_quantity = COALESCE(?, max_quantity), barcode = COALESCE(?, barcode), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [name, name_en, category, unit, purchase_price, selling_price, current_quantity, min_quantity, max_quantity, barcode, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_item', 'item', parseInt(req.params.id));
    res.json({ message: 'Item updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE items SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_item', 'item', parseInt(req.params.id));
    res.json({ message: 'Item deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/adjust', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { quantity, reason } = req.body;
    const item = await queryOne("SELECT * FROM items WHERE id = ?", [req.params.id]) as any;
    if (!item) return res.status(404).json({ error: "Item not found" });
    await execute("UPDATE items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [quantity, req.params.id]);
    void logActivityAsync(req.user!.id, 'adjust_stock', 'item', parseInt(req.params.id), "Adjusted from " + item.current_quantity + " to " + quantity + ". Reason: " + (reason || 'N/A'));
    res.json({ message: 'Stock adjusted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
