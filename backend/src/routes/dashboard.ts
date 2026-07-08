import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/stats', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date().toISOString().split('T')[0].substring(0, 7) + '-01';

    const todaySales = db.prepare("SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales_invoices WHERE invoice_date = ?").get(today) as any;
    const monthSales = db.prepare("SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales_invoices WHERE invoice_date >= ?").get(monthStart) as any;
    const totalClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE is_active = 1").get() as any;
    const totalItems = db.prepare("SELECT COUNT(*) as count FROM items WHERE is_active = 1").get() as any;
    const lowStockItems = db.prepare("SELECT COUNT(*) as count FROM items WHERE is_active = 1 AND current_quantity <= min_quantity").get() as any;
    const todayAttendance = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ?").get(today) as any;
    const pendingInvoices = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(remaining_amount), 0) as total FROM sales_invoices WHERE payment_status IN ('unpaid', 'partial')").get() as any;
    const activeDoctors = db.prepare("SELECT COUNT(*) as count FROM doctors WHERE is_active = 1").get() as any;

    res.json({
      today_sales: todaySales.total,
      today_sales_count: todaySales.count,
      month_sales: monthSales.total,
      month_sales_count: monthSales.count,
      total_clients: totalClients.count,
      total_items: totalItems.count,
      low_stock_items: lowStockItems.count,
      today_attendance: todayAttendance.count,
      pending_invoices: pendingInvoices.count,
      pending_amount: pendingInvoices.total,
      active_doctors: activeDoctors.count
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/recent-sales', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const sales = db.prepare(`SELECT si.id, si.invoice_number, si.total, si.invoice_date, si.payment_status, c.name as client_name
      FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id ORDER BY si.created_at DESC LIMIT 10`).all();
    res.json(sales);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/monthly-sales', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const data = db.prepare(`SELECT strftime('%Y-%m', invoice_date) as month, COUNT(*) as count, SUM(total) as total
      FROM sales_invoices WHERE invoice_date >= date('now', '-12 months') GROUP BY month ORDER BY month ASC`).all();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/top-sales-reps', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const monthStart = new Date().toISOString().split('T')[0].substring(0, 7) + '-01';
    const reps = db.prepare(`SELECT u.id, u.full_name, COUNT(si.id) as sales_count, COALESCE(SUM(si.total), 0) as total_sales
      FROM users u LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id AND si.invoice_date >= ?
      WHERE u.role = 'sales_rep' GROUP BY u.id, u.full_name ORDER BY total_sales DESC`).all(monthStart);
    res.json(reps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/sales-trend', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const sales = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all();
    res.json(sales);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/yearly-comparison', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const currentYear = db.prepare(`
      SELECT strftime('%m', created_at) as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y', created_at) = strftime('%Y', 'now')
      GROUP BY strftime('%m', created_at)
      ORDER BY month
    `).all();
    const lastYear = db.prepare(`
      SELECT strftime('%m', created_at) as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE strftime('%Y', created_at) = strftime('%Y', 'now', '-1 year')
      GROUP BY strftime('%m', created_at)
      ORDER BY month
    `).all();
    res.json({ currentYear, lastYear });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/predictive', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const monthlyTotals = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE created_at >= DATE('now', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all() as any[];

    let prediction = null;
    let growthRate = 0;
    if (monthlyTotals.length >= 2) {
      const last = monthlyTotals[monthlyTotals.length - 1].total;
      const prev = monthlyTotals[monthlyTotals.length - 2].total;
      growthRate = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      prediction = last * (1 + growthRate / 100);
    }

    res.json({ monthlyTotals, prediction, growthRate, confidence: monthlyTotals.length >= 3 ? 'high' : 'medium' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/alerts', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const lowStock = db.prepare(`
      SELECT id, name, current_quantity as quantity, min_quantity FROM items WHERE current_quantity <= min_quantity LIMIT 10
    `).all();
    const pendingInvoices = db.prepare(`
      SELECT id, invoice_number, total FROM sales_invoices WHERE payment_status = 'unpaid' LIMIT 10
    `).all();
    res.json({ lowStock, pendingInvoices });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


