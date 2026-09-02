import { Router, Response } from 'express';
import { query, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { days = 30 } = req.query;
    const futureDate = new Date(Date.now() + Number(days) * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const items = await query(`SELECT ib.*, i.name as item_name, i.code as item_code FROM item_batches ib JOIN items i ON i.id = ib.item_id WHERE ib.expiry_date BETWEEN $1 AND $2 ORDER BY ib.expiry_date`, [today, futureDate]);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/item/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const batches = await query('SELECT * FROM item_batches WHERE item_id = ? ORDER BY expiry_date', [req.params.itemId]);
    res.json(batches);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, batch_number, quantity, expiry_date, purchase_price } = req.body;
    const result = await execute('INSERT INTO item_batches (item_id, batch_number, quantity, expiry_date, purchase_price) VALUES (?, ?, ?, ?, ?)',
      [item_id, batch_number, quantity, expiry_date, purchase_price]);
    res.json({ id: result.id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
