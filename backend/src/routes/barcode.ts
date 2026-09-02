import { Router, Response } from 'express';
import { queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/lookup/:barcode', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const item = await queryOne(`SELECT i.*, COALESCE(SUM(wi.quantity), 0) as stock FROM items i LEFT JOIN warehouse_items wi ON wi.item_id = i.id WHERE i.barcode = ? GROUP BY i.id`, [req.params.barcode]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
