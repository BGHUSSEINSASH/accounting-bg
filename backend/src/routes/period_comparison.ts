import { Router, Response } from 'express';
import { queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { p1_from, p1_to, p2_from, p2_to } = req.query;

    const getPeriod = async (from: string, to: string) => {
      const sales = (await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE invoice_date >= ? AND invoice_date <= ?", [from, to]) as any)?.total || 0;
      const purchases = (await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM purchase_invoices WHERE invoice_date >= ? AND invoice_date <= ?", [from, to]) as any)?.total || 0;
      const expenses = (await queryOne("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= ? AND expense_date <= ? AND status = 'approved'", [from, to]) as any)?.total || 0;
      const invoiceCount = (await queryOne("SELECT COUNT(*) as count FROM sales_invoices WHERE invoice_date >= ? AND invoice_date <= ?", [from, to]) as any)?.count || 0;
      const clientCount = (await queryOne("SELECT COUNT(DISTINCT client_id) as count FROM sales_invoices WHERE invoice_date >= ? AND invoice_date <= ?", [from, to]) as any)?.count || 0;
      return { sales, purchases, expenses, profit: sales - purchases - expenses, invoiceCount, clientCount };
    };

    const p1 = await getPeriod(p1_from as string, p1_to as string);
    const p2 = await getPeriod(p2_from as string, p2_to as string);
    res.json({ p1, p2 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
