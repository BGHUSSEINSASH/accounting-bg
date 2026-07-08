import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get('/item/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const prices = db.prepare("SELECT * FROM item_prices WHERE item_id = ? AND is_active = 1 ORDER BY price_type").all(req.params.itemId);
    res.json(prices);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/item/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const { price_type, price, min_quantity } = req.body;
    if (!price_type || price == null) return res.status(400).json({ error: "price_type and price are required" });
    const db = getDatabase();
    db.prepare("INSERT INTO item_prices (item_id, price_type, price, min_quantity) VALUES (?, ?, ?, ?) ON CONFLICT(item_id, price_type) DO UPDATE SET price = ?, min_quantity = COALESCE(?, min_quantity)")
      .run(req.params.itemId, price_type, price, min_quantity || 1, price, min_quantity);
    logActivity(req.user!.id, 'save_item_price', 'item_price', undefined, `item_id=${req.params.itemId},price_type=${price_type}`);
    res.json({ message: "Price saved" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare("UPDATE item_prices SET is_active = 0 WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, 'delete_item_price', 'item_price', parseInt(req.params.id));
    res.json({ message: "Price deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
