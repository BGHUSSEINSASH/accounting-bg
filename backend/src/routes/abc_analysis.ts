import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT i.id, i.name, i.current_quantity, i.selling_price, 
             COALESCE(SUM(sii.quantity * sii.unit_price), 0) as total_sales
      FROM items i
      LEFT JOIN sales_invoice_items sii ON sii.item_id = i.id
      WHERE i.is_active = 1
      GROUP BY i.id
      ORDER BY total_sales DESC
    `).all() as any[];

    const total = items.reduce((sum: number, i: any) => sum + i.total_sales, 0);
    let cumulative = 0;
    const classified = items.map((item: any) => {
      cumulative += item.total_sales;
      const percentage = total > 0 ? (cumulative / total) * 100 : 0;
      let category = 'C';
      if (percentage <= 70) category = 'A';
      else if (percentage <= 90) category = 'B';
      return { ...item, percentage: total > 0 ? (item.total_sales / total) * 100 : 0, cumulative_percentage: percentage, category };
    });

    res.json({
      items: classified,
      a_count: classified.filter((i: any) => i.category === 'A').length,
      b_count: classified.filter((i: any) => i.category === 'B').length,
      c_count: classified.filter((i: any) => i.category === 'C').length
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/reorder', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const reorder = db.prepare(`
      SELECT i.id, i.name, i.current_quantity, i.min_quantity, i.max_quantity, i.selling_price
      FROM items i
      WHERE i.current_quantity <= i.min_quantity AND i.is_active = 1
      ORDER BY (i.min_quantity - i.current_quantity) DESC
    `).all();
    res.json(reorder);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
