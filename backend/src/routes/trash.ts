import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/items', async (req: AuthRequest, res: Response) => {
  try {
    const items = await query(`SELECT i.*, u.username as deleted_by_name FROM items i LEFT JOIN users u ON i.deleted_by = u.id WHERE i.is_active = 0 OR i.deleted_at IS NOT NULL ORDER BY COALESCE(i.deleted_at::text, '') DESC`);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/restore/item/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await queryOne('SELECT * FROM items WHERE id = ?', [req.params.id]) as any;
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    await execute('UPDATE items SET is_active = 1, deleted_at = NULL, deleted_by = NULL WHERE id = ?', [req.params.id]);
    await execute('DELETE FROM deleted_records WHERE entity_type = ? AND entity_id = ?', ['item', req.params.id]);
    void logActivityAsync(req.user!.id, 'restore_item', 'item', parseInt(req.params.id));
    res.json({ message: 'تم استعادة الصنف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/items/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM warehouse_items WHERE item_id = ?', [req.params.id]);
    await execute('DELETE FROM item_batches WHERE item_id = ?', [req.params.id]);
    await execute('DELETE FROM items WHERE id = ?', [req.params.id]);
    await execute('DELETE FROM deleted_records WHERE entity_type = ? AND entity_id = ?', ['item', req.params.id]);
    res.json({ message: 'تم الحذف نهائياً' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/records', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT dr.*, u.username as deleted_by_name FROM deleted_records dr LEFT JOIN users u ON dr.deleted_by = u.id ORDER BY dr.deleted_at DESC LIMIT 500`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/records/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM deleted_records WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
