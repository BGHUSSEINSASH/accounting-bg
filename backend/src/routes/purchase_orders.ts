import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/supplier/:supplierId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM purchase_orders WHERE supplier_id = ?").get(req.params.supplierId) as any).total;
    const orders = db.prepare("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.supplier_id = ? ORDER BY po.created_at DESC LIMIT ? OFFSET ?").all(req.params.supplierId, Number(limit), offset);
    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1";
    const params: any[] = [];
    if (status) { query += " AND po.status = ?"; params.push(status); }
    const total = (db.prepare(query.replace("po.*, s.name as supplier_name", "COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY po.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const orders = db.prepare(query).all(...params);
    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const order = db.prepare("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?").get(req.params.id) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    order.items = db.prepare("SELECT poi.*, i.name as item_name, i.code as item_code FROM purchase_order_items poi JOIN items i ON poi.item_id = i.id WHERE poi.purchase_order_id = ?").all(req.params.id);
    res.json(order);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { order_date, supplier_id, expected_date, notes, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const db = getDatabase();
    const orderNumber = generateCode("PO-", "purchase_orders", "order_number");
    const trx = db.transaction(() => {
      let subtotal = 0;
      for (const item of items) { subtotal += item.quantity * item.unit_price; }
      const discount = 0;
      const tax = 0;
      const total = subtotal - discount + tax;
      const result = db.prepare("INSERT INTO purchase_orders (order_number, order_date, supplier_id, expected_date, subtotal, discount, tax, total, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
        .run(orderNumber, order_date, supplier_id || null, expected_date || null, subtotal, discount, tax, total, notes || null, req.user!.id);
      const orderId = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        insertItem.run(orderId, item.item_id, item.quantity, item.unit_price, itemTotal);
      }
      return orderId;
    });
    const orderId = trx();
    logActivity(req.user!.id, "create_purchase_order", "purchase_order", orderId as number);
    res.json({ message: "Purchase order created", id: orderId, order_number: orderNumber });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const db = getDatabase();
    const order = db.prepare("SELECT id, status FROM purchase_orders WHERE id = ?").get(req.params.id) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    const validStatuses = ["pending", "approved", "received", "cancelled"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    if (status === "approved") {
      db.prepare("UPDATE purchase_orders SET status = ?, approved_by = ? WHERE id = ?").run(status, req.user!.id, req.params.id);
    } else {
      db.prepare("UPDATE purchase_orders SET status = ? WHERE id = ?").run(status, req.params.id);
    }
    logActivity(req.user!.id, "update_purchase_order_status", "purchase_order", parseInt(req.params.id), `Status changed to ${status}`);
    res.json({ message: "Purchase order updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const order = db.prepare("SELECT id, status FROM purchase_orders WHERE id = ?").get(req.params.id) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    if (order.status !== "pending") return res.status(400).json({ error: "Only pending orders can be deleted" });
    db.prepare("DELETE FROM purchase_order_items WHERE purchase_order_id = ?").run(req.params.id);
    db.prepare("DELETE FROM purchase_orders WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_purchase_order", "purchase_order", parseInt(req.params.id));
    res.json({ message: "Purchase order deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/receive', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const order = db.prepare("SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?").get(req.params.id) as any;
    if (!order) return res.status(404).json({ error: "Purchase order not found" });
    if (order.status !== "approved") return res.status(400).json({ error: "Only approved orders can be received" });
    const items = db.prepare("SELECT poi.*, i.purchase_price FROM purchase_order_items poi JOIN items i ON poi.item_id = i.id WHERE poi.purchase_order_id = ?").all(req.params.id) as any[];
    const trx = db.transaction(() => {
      const updateItem = db.prepare("UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?");
      for (const item of items) {
        updateItem.run(item.quantity, item.id);
      }
      let warehouseId = 1;
      const warehouse = db.prepare("SELECT id FROM warehouses WHERE id = ?").get(1);
      if (!warehouse) {
        const whCode = generateCode("WH-", "warehouses");
        const result = db.prepare("INSERT INTO warehouses (code, name) VALUES (?, ?)").run(whCode, "Default Warehouse");
        warehouseId = result.lastInsertRowid as number;
      }
      const upsertWarehouse = db.prepare("INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, ?) ON CONFLICT(warehouse_id, item_id) DO UPDATE SET quantity = quantity + ?");
      const updateItemQty = db.prepare("UPDATE items SET current_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_items WHERE item_id = ?), purchase_price = ? WHERE id = ?");
      const insertMovement = db.prepare("INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, created_by) VALUES (?, ?, 'in', ?, 'purchase_order', ?, ?)");
      for (const item of items) {
        upsertWarehouse.run(warehouseId, item.item_id, item.quantity, item.quantity);
        updateItemQty.run(item.item_id, item.purchase_price || item.unit_price, item.item_id);
        insertMovement.run(item.item_id, warehouseId, item.quantity, order.id, req.user!.id);
      }
      let invoiceId = null;
      if (order.supplier_id) {
        const invoiceNumber = generateCode("PUR", "purchase_invoices", "invoice_number");
        const invoiceResult = db.prepare("INSERT INTO purchase_invoices (invoice_number, invoice_date, supplier_id, subtotal, discount, tax, total, payment_status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)")
          .run(invoiceNumber, order.order_date, order.supplier_id, order.subtotal, order.discount, order.tax, order.total, order.notes, req.user!.id);
        invoiceId = invoiceResult.lastInsertRowid as number;
        const insertInvItem = db.prepare("INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)");
        for (const item of items) {
          insertInvItem.run(invoiceId, item.item_id, item.quantity, item.unit_price, item.total);
        }
        db.prepare("UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?").run(order.total, order.supplier_id);
      }
      if (invoiceId) {
        db.prepare("UPDATE purchase_orders SET status = 'received', purchase_invoice_id = ? WHERE id = ?").run(invoiceId, order.id);
      } else {
        db.prepare("UPDATE purchase_orders SET status = 'received' WHERE id = ?").run(order.id);
      }
    });
    trx();
    logActivity(req.user!.id, "receive_purchase_order", "purchase_order", parseInt(req.params.id));
    res.json({ message: "Purchase order received successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
