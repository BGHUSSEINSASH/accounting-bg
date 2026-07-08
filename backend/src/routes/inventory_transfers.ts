import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, status, from_warehouse, to_warehouse } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name, u.full_name as created_by_name
      FROM inventory_transfers it
      JOIN warehouses fw ON it.from_warehouse_id = fw.id
      JOIN warehouses tw ON it.to_warehouse_id = tw.id
      LEFT JOIN users u ON it.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { query += ' AND it.status = ?'; params.push(status); }
    if (from_warehouse) { query += ' AND it.from_warehouse_id = ?'; params.push(from_warehouse); }
    if (to_warehouse) { query += ' AND it.to_warehouse_id = ?'; params.push(to_warehouse); }
    const total = (db.prepare(query.replace('it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name, u.full_name as created_by_name', 'COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY it.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const transfers = db.prepare(query).all(...params);
    res.json({ transfers, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const transfer = db.prepare(`SELECT it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
      FROM inventory_transfers it JOIN warehouses fw ON it.from_warehouse_id = fw.id JOIN warehouses tw ON it.to_warehouse_id = tw.id
      WHERE it.id = ?`).get(req.params.id) as any;
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    transfer.items = db.prepare(`SELECT iti.*, i.name as item_name, i.code as item_code, i.unit
      FROM inventory_transfer_items iti JOIN items i ON iti.item_id = i.id WHERE iti.transfer_id = ?`).all(req.params.id);
    res.json(transfer);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from_warehouse_id, to_warehouse_id, transfer_date, items, notes } = req.body;
    if (!from_warehouse_id || !to_warehouse_id) return res.status(400).json({ error: 'المستودعات مطلوبة' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'يجب إضافة أصناف' });
    if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ error: 'لا يمكن التحويل للمستودع نفسه' });

    const transferNum = generateCode('TRF', 'inventory_transfers', 'transfer_number');
    const trx = db.transaction(() => {
      // التحقق من الكميات
      for (const item of items) {
        const stock = db.prepare('SELECT quantity FROM warehouse_items WHERE warehouse_id = ? AND item_id = ?').get(from_warehouse_id, item.item_id) as any;
        const available = stock?.quantity || 0;
        if (available < item.quantity) {
          const itemData = db.prepare('SELECT name FROM items WHERE id = ?').get(item.item_id) as any;
          throw new Error(`الكمية غير كافية للصنف: ${itemData?.name || item.item_id} (متاح: ${available})`);
        }
      }

      const result = db.prepare(`INSERT INTO inventory_transfers (transfer_number, transfer_date, from_warehouse_id, to_warehouse_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`).run(transferNum, transfer_date || new Date().toISOString().split('T')[0], from_warehouse_id, to_warehouse_id, notes || null, req.user!.id);
      const transferId = result.lastInsertRowid;

      for (const item of items) {
        db.prepare('INSERT INTO inventory_transfer_items (transfer_id, item_id, quantity, notes) VALUES (?, ?, ?, ?)').run(transferId, item.item_id, item.quantity, item.notes || null);
      }
      return transferId;
    });

    const id = trx();
    logActivity(req.user!.id, 'create_transfer', 'inventory_transfer', id as number);
    res.json({ message: 'تم إنشاء التحويل', id, transfer_number: transferNum });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// اعتماد التحويل وتنفيذه
router.post('/:id/complete', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const transfer = db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').get(req.params.id) as any;
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.status !== 'pending') return res.status(400).json({ error: 'التحويل مكتمل مسبقاً' });

    const items = db.prepare('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?').all(req.params.id) as any[];

    const trx = db.transaction(() => {
      for (const item of items) {
        // خصم من المستودع الأصل
        db.prepare(`INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, 0)
          ON CONFLICT(warehouse_id, item_id) DO NOTHING`).run(transfer.from_warehouse_id, item.item_id);
        db.prepare('UPDATE warehouse_items SET quantity = quantity - ? WHERE warehouse_id = ? AND item_id = ?').run(item.quantity, transfer.from_warehouse_id, item.item_id);

        // إضافة للمستودع الهدف
        db.prepare(`INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES (?, ?, 0)
          ON CONFLICT(warehouse_id, item_id) DO NOTHING`).run(transfer.to_warehouse_id, item.item_id);
        db.prepare('UPDATE warehouse_items SET quantity = quantity + ? WHERE warehouse_id = ? AND item_id = ?').run(item.quantity, transfer.to_warehouse_id, item.item_id);

        // تسجيل حركة المخزون
        db.prepare(`INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
          VALUES (?, ?, 'transfer_out', ?, 'transfer', ?, 'تحويل مخزون', ?)`).run(item.item_id, transfer.from_warehouse_id, item.quantity, req.params.id, req.user!.id);
        db.prepare(`INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
          VALUES (?, ?, 'transfer_in', ?, 'transfer', ?, 'تحويل مخزون', ?)`).run(item.item_id, transfer.to_warehouse_id, item.quantity, req.params.id, req.user!.id);
      }
      db.prepare("UPDATE inventory_transfers SET status = 'completed', approved_by = ? WHERE id = ?").run(req.user!.id, req.params.id);
    });

    trx();
    logActivity(req.user!.id, 'complete_transfer', 'inventory_transfer', parseInt(req.params.id));
    res.json({ message: 'تم إتمام التحويل بنجاح' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/cancel', authorize('admin', 'manager'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare("UPDATE inventory_transfers SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(req.params.id);
    res.json({ message: 'تم الإلغاء' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
