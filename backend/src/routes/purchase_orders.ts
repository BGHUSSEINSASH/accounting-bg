import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/supplier/:supplierId', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM purchase_orders WHERE supplier_id = ?", [req.params.supplierId]) as any;
    const total = countRow?.total ?? 0;
    const orders = await query("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.supplier_id = ? ORDER BY po.created_at DESC LIMIT ? OFFSET ?", [req.params.supplierId, Number(limit), offset]);
    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1";
    const params: any[] = [];
    if (status) { sql += " AND po.status = ?"; params.push(status); }
    const countRow = await queryOne(sql.replace("po.*, s.name as supplier_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY po.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const orders = await query(sql, params);
    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await queryOne("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?", [req.params.id]) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    order.items = await query("SELECT poi.*, i.name as item_name, i.code as item_code FROM purchase_order_items poi JOIN items i ON poi.item_id = i.id WHERE poi.purchase_order_id = ?", [req.params.id]);
    res.json(order);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { order_date, supplier_id, expected_date, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const orderNumber = await generateCodeAsync("PO-", "purchase_orders", "order_number");
    const orderId = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const total = subtotal;
      const result = await client.query(
        "INSERT INTO purchase_orders (order_number, order_date, supplier_id, expected_date, subtotal, discount, tax, total, status, notes, created_by) VALUES ($1,$2,$3,$4,$5,0,0,$6,'pending',$7,$8) RETURNING id",
        [orderNumber, order_date, supplier_id || null, expected_date || null, subtotal, total, notes || null, req.user!.id]
      );
      const oid = result.rows[0].id;
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query("INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
          [oid, item.item_id, item.quantity, item.unit_price, itemTotal]);
      }
      return oid;
    });
    void logActivityAsync(req.user!.id, "create_purchase_order", "purchase_order", orderId as number);
    res.json({ message: "Purchase order created", id: orderId, order_number: orderNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const order = await queryOne("SELECT id, status FROM purchase_orders WHERE id = ?", [req.params.id]) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    const validStatuses = ["pending", "approved", "received", "cancelled"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    if (status === "approved") {
      await execute("UPDATE purchase_orders SET status = ?, approved_by = ? WHERE id = ?", [status, req.user!.id, req.params.id]);
    } else {
      await execute("UPDATE purchase_orders SET status = ? WHERE id = ?", [status, req.params.id]);
    }
    void logActivityAsync(req.user!.id, "update_purchase_order_status", "purchase_order", parseInt(req.params.id), `Status changed to ${status}`);
    res.json({ message: "Purchase order updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await queryOne("SELECT id, status FROM purchase_orders WHERE id = ?", [req.params.id]) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    if (order.status !== "pending") return res.status(400).json({ error: "Only pending orders can be deleted" });
    await execute("DELETE FROM purchase_order_items WHERE purchase_order_id = ?", [req.params.id]);
    await execute("DELETE FROM purchase_orders WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_purchase_order", "purchase_order", parseInt(req.params.id));
    res.json({ message: "Purchase order deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/receive', async (req: AuthRequest, res: Response) => {
  try {
    const order = await queryOne("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?", [req.params.id]) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    if (order.status !== "approved") return res.status(400).json({ error: "Only approved orders can be received" });
    const items = await query("SELECT poi.*, i.purchase_price FROM purchase_order_items poi JOIN items i ON poi.item_id = i.id WHERE poi.purchase_order_id = ?", [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query("UPDATE purchase_order_items SET received_quantity = $1 WHERE id = $2", [item.quantity, item.id]);
      }
      let warehouseId = 1;
      const warehouse = await client.query("SELECT id FROM warehouses WHERE id = $1", [1]).then(r => r.rows[0]);
      if (!warehouse) {
        const whRes = await client.query("INSERT INTO warehouses (code, name) VALUES ($1,$2) RETURNING id", ["WH-1", "Default Warehouse"]);
        warehouseId = whRes.rows[0].id;
      }
      for (const item of items) {
        await client.query("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES ($1,$2,$3) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = warehouse_items.quantity + $3",
          [warehouseId, item.item_id, item.quantity]);
        await client.query("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = $1), purchase_price = $2 WHERE id = $1",
          [item.item_id, item.purchase_price || item.unit_price]);
        await client.query("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by) VALUES ($1,$2,'in',$3,'purchase_order',$4,$5)",
          [item.item_id, warehouseId, item.quantity, order.id, req.user!.id]);
      }
      let invoiceId = null;
      if (order.supplier_id) {
        const invoiceNumber = await generateCodeAsync("PUR", "purchase_invoices", "invoice_number");
        const invoiceRes = await client.query(
          "INSERT INTO purchase_invoices (invoice_number, invoice_date, supplier_id, subtotal, discount, tax, total, payment_status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'unpaid',$8,$9) RETURNING id",
          [invoiceNumber, order.order_date, order.supplier_id, order.subtotal, order.discount, order.tax, order.total, order.notes, req.user!.id]
        );
        invoiceId = invoiceRes.rows[0].id;
        for (const item of items) {
          await client.query("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)",
            [invoiceId, item.item_id, item.quantity, item.unit_price, item.total]);
        }
        await client.query("UPDATE suppliers SET current_balance = current_balance + $1 WHERE id = $2", [order.total, order.supplier_id]);
      }
      if (invoiceId) {
        await client.query("UPDATE purchase_orders SET status = 'received', purchase_invoice_id = $1 WHERE id = $2", [invoiceId, order.id]);
      } else {
        await client.query("UPDATE purchase_orders SET status = 'received' WHERE id = $1", [order.id]);
      }
    });
    void logActivityAsync(req.user!.id, "receive_purchase_order", "purchase_order", parseInt(req.params.id));
    res.json({ message: "Purchase order received successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
