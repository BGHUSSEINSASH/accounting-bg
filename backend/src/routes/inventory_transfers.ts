import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, from_warehouse, to_warehouse } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name, u.full_name as created_by_name
      FROM inventory_transfers it
      JOIN warehouses fw ON it.from_warehouse_id = fw.id
      JOIN warehouses tw ON it.to_warehouse_id = tw.id
      LEFT JOIN users u ON it.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ' AND it.status = ?'; params.push(status); }
    if (from_warehouse) { sql += ' AND it.from_warehouse_id = ?'; params.push(from_warehouse); }
    if (to_warehouse) { sql += ' AND it.to_warehouse_id = ?'; params.push(to_warehouse); }
    const countRow = await queryOne(sql.replace('it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name, u.full_name as created_by_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY it.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const transfers = await query(sql, params);
    res.json({ transfers, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const transfer = await queryOne(`SELECT it.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
      FROM inventory_transfers it JOIN warehouses fw ON it.from_warehouse_id = fw.id JOIN warehouses tw ON it.to_warehouse_id = tw.id
      WHERE it.id = ?`, [req.params.id]) as any;
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    transfer.items = await query(`SELECT iti.*, i.name as item_name, i.code as item_code, i.unit
      FROM inventory_transfer_items iti JOIN items i ON iti.item_id = i.id WHERE iti.transfer_id = ?`, [req.params.id]);
    res.json(transfer);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { from_warehouse_id, to_warehouse_id, transfer_date, items, notes } = req.body;
    if (!from_warehouse_id || !to_warehouse_id) return res.status(400).json({ error: 'المستودعات مطلوبة' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'يجب إضافة أصناف' });
    if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ error: 'لا يمكن التحويل للمستودع نفسه' });
    const transferNum = await generateCodeAsync('TRF', 'inventory_transfers', 'transfer_number');
    const id = await withTransaction(async (client) => {
      for (const item of items) {
        const stock = await client.query('SELECT quantity FROM warehouse_items WHERE warehouse_id = $1 AND item_id = $2', [from_warehouse_id, item.item_id]).then(r => r.rows[0]);
        const available = stock?.quantity || 0;
        if (available < item.quantity) {
          const itemData = await client.query('SELECT name FROM items WHERE id = $1', [item.item_id]).then(r => r.rows[0]);
          throw new Error(`الكمية غير كافية للصنف: ${itemData?.name || item.item_id} (متاح: ${available})`);
        }
      }
      const result = await client.query(
        `INSERT INTO inventory_transfers (transfer_number, transfer_date, from_warehouse_id, to_warehouse_id, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [transferNum, transfer_date || new Date().toISOString().split('T')[0], from_warehouse_id, to_warehouse_id, notes || null, req.user!.id]
      );
      const transferId = result.rows[0].id;
      for (const item of items) {
        await client.query('INSERT INTO inventory_transfer_items (transfer_id, item_id, quantity, notes) VALUES ($1,$2,$3,$4)', [transferId, item.item_id, item.quantity, item.notes || null]);
      }
      return transferId;
    });
    void logActivityAsync(req.user!.id, 'create_transfer', 'inventory_transfer', id as number);
    res.json({ message: 'تم إنشاء التحويل', id, transfer_number: transferNum });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/complete', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const transfer = await queryOne('SELECT * FROM inventory_transfers WHERE id = ?', [req.params.id]) as any;
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.status !== 'pending') return res.status(400).json({ error: 'التحويل مكتمل مسبقاً' });
    const items = await query('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?', [req.params.id]) as any[];
    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query(`INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES ($1,$2,0) ON CONFLICT(warehouse_id, item_id) DO NOTHING`, [transfer.from_warehouse_id, item.item_id]);
        await client.query('UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND item_id = $3', [item.quantity, transfer.from_warehouse_id, item.item_id]);
        await client.query(`INSERT INTO warehouse_items (warehouse_id, item_id, quantity) VALUES ($1,$2,0) ON CONFLICT(warehouse_id, item_id) DO NOTHING`, [transfer.to_warehouse_id, item.item_id]);
        await client.query('UPDATE warehouse_items SET quantity = quantity + $1 WHERE warehouse_id = $2 AND item_id = $3', [item.quantity, transfer.to_warehouse_id, item.item_id]);
        await client.query(`INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by) VALUES ($1,$2,'transfer_out',$3,'transfer',$4,'تحويل مخزون',$5)`,
          [item.item_id, transfer.from_warehouse_id, item.quantity, req.params.id, req.user!.id]);
        await client.query(`INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by) VALUES ($1,$2,'transfer_in',$3,'transfer',$4,'تحويل مخزون',$5)`,
          [item.item_id, transfer.to_warehouse_id, item.quantity, req.params.id, req.user!.id]);
      }
      await client.query("UPDATE inventory_transfers SET status = 'completed', approved_by = $1 WHERE id = $2", [req.user!.id, req.params.id]);
    });
    void logActivityAsync(req.user!.id, 'complete_transfer', 'inventory_transfer', parseInt(req.params.id));
    res.json({ message: 'تم إتمام التحويل بنجاح' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/cancel', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE inventory_transfers SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [req.params.id]);
    res.json({ message: 'تم الإلغاء' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
