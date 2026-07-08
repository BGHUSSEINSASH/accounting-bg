import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let dateFilter = '';
    const params: any[] = [];
    if (from || to) {
      if (!from || !to) return res.status(400).json({ error: "Both 'from' and 'to' are required for date filtering" });
      dateFilter = 'AND si.created_at BETWEEN ? AND ?';
      params.push(from as string, to as string);
    }

    const reps = db.prepare(`
      SELECT u.id, u.full_name, COUNT(si.id) as invoice_count, 
             COALESCE(SUM(si.total), 0) as total_sales,
             COALESCE(SUM(si.paid_amount), 0) as total_collected,
             COALESCE(AVG(si.total), 0) as avg_invoice
      FROM users u
      LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id ${dateFilter}
      WHERE u.role IN ('sales_rep', 'manager')
      GROUP BY u.id
      ORDER BY total_sales DESC
    `).all(...params);

    res.json(reps);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
