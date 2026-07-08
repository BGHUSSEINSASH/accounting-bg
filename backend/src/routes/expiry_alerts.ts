import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { days = 30 } = req.query;
    const items = db.prepare(`
      SELECT ib.*, i.name as item_name, i.code as item_code
      FROM item_batches ib
      JOIN items i ON i.id = ib.item_id
      WHERE ib.expiry_date BETWEEN DATE('now') AND DATE('now', '+' || ? || ' days')
      ORDER BY ib.expiry_date
    `).all(Number(days));
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/item/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const batches = db.prepare('SELECT * FROM item_batches WHERE item_id = ? ORDER BY expiry_date').all(req.params.itemId);
    res.json(batches);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { item_id, batch_number, quantity, expiry_date, purchase_price } = req.body;
    const result = db.prepare('INSERT INTO item_batches (item_id, batch_number, quantity, expiry_date, purchase_price) VALUES (?, ?, ?, ?, ?)').run(item_id, batch_number, quantity, expiry_date, purchase_price);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
