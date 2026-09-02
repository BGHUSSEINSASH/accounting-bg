import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/items', async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    let sql = "SELECT id, code, name, name_en, barcode, selling_price, purchase_price, current_quantity, unit, category FROM items WHERE is_active = 1";
    const params: any[] = [];
    if (search) { sql += " AND (name LIKE ? OR code LIKE ? OR barcode LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += " ORDER BY name LIMIT 200";
    const items = await query(sql, params);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
