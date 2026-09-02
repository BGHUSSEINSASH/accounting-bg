import { Router, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date().toISOString().split('T')[0].substring(0, 7) + '-01';

    const todaySales = await queryOne("SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales_invoices WHERE invoice_date = ?", [today]) as any;
    const monthSales = await queryOne("SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales_invoices WHERE invoice_date >= ?", [monthStart]) as any;
    const totalClients = await queryOne("SELECT COUNT(*) as count FROM clients WHERE is_active = 1") as any;
    const totalItems = await queryOne("SELECT COUNT(*) as count FROM items WHERE is_active = 1") as any;
    const lowStockItems = await queryOne("SELECT COUNT(*) as count FROM items WHERE is_active = 1 AND current_quantity <= min_quantity") as any;
    const todayAttendance = await queryOne("SELECT COUNT(*) as count FROM attendance WHERE date = ?", [today]) as any;
    const pendingInvoices = await queryOne("SELECT COUNT(*) as count, COALESCE(SUM(remaining_amount), 0) as total FROM sales_invoices WHERE payment_status IN ('unpaid', 'partial')") as any;
    const activeDoctors = await queryOne("SELECT COUNT(*) as count FROM doctors WHERE is_active = 1") as any;

    // Overdue stats (> 30 days)
    const overdueStats = await queryOne(`
      SELECT COUNT(*) as count, COALESCE(SUM(remaining_amount), 0) as amount
      FROM sales_invoices
      WHERE payment_status IN ('unpaid', 'partial')
        AND invoice_date < CURRENT_DATE - INTERVAL '30 days'
    `) as any;

    const overdueTop = await query(`
      SELECT c.name as client_name, c.phone,
             COUNT(si.id) as invoice_count,
             COALESCE(SUM(si.remaining_amount), 0) as total_overdue
      FROM sales_invoices si
      JOIN clients c ON si.client_id = c.id
      WHERE si.payment_status IN ('unpaid', 'partial')
        AND si.invoice_date < CURRENT_DATE - INTERVAL '30 days'
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_overdue DESC
      LIMIT 5
    `);

    res.json({
      today_sales: todaySales?.total,
      today_sales_count: todaySales?.count,
      month_sales: monthSales?.total,
      month_sales_count: monthSales?.count,
      total_clients: totalClients?.count,
      total_items: totalItems?.count,
      low_stock_items: lowStockItems?.count,
      today_attendance: todayAttendance?.count,
      pending_invoices: pendingInvoices?.count,
      pending_amount: pendingInvoices?.total,
      active_doctors: activeDoctors?.count,
      overdue_count: overdueStats?.count || 0,
      overdue_amount: overdueStats?.amount || 0,
      overdue_top: overdueTop || [],
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/recent-sales', async (_req: AuthRequest, res: Response) => {
  try {
    const sales = await query(`SELECT si.id, si.invoice_number, si.total, si.invoice_date, si.payment_status, c.name as client_name
      FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id ORDER BY si.created_at DESC LIMIT 10`);
    res.json(sales);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/monthly-sales', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await query(`SELECT TO_CHAR(invoice_date, 'YYYY-MM') as month, COUNT(*) as count, SUM(total) as total
      FROM sales_invoices WHERE invoice_date >= NOW() - INTERVAL '12 months' GROUP BY month ORDER BY month ASC`);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/top-sales-reps', async (_req: AuthRequest, res: Response) => {
  try {
    const monthStart = new Date().toISOString().split('T')[0].substring(0, 7) + '-01';
    const reps = await query(`SELECT u.id, u.full_name, COUNT(si.id) as sales_count, COALESCE(SUM(si.total), 0) as total_sales
      FROM users u LEFT JOIN sales_invoices si ON si.sales_rep_id = u.id AND si.invoice_date >= ?
      WHERE u.role = 'sales_rep' GROUP BY u.id, u.full_name ORDER BY total_sales DESC`, [monthStart]);
    res.json(reps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/sales-trend', async (_req: AuthRequest, res: Response) => {
  try {
    const sales = await query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    res.json(sales);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/yearly-comparison', async (_req: AuthRequest, res: Response) => {
  try {
    const currentYear = await query(`
      SELECT TO_CHAR(created_at, 'MM') as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
      GROUP BY TO_CHAR(created_at, 'MM')
      ORDER BY month
    `);
    const lastYear = await query(`
      SELECT TO_CHAR(created_at, 'MM') as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW()) - 1
      GROUP BY TO_CHAR(created_at, 'MM')
      ORDER BY month
    `);
    res.json({ currentYear, lastYear });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/predictive', async (_req: AuthRequest, res: Response) => {
  try {
    const monthlyTotals = await query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(total), 0) as total
      FROM sales_invoices
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `) as any[];

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

router.get('/alerts', async (_req: AuthRequest, res: Response) => {
  try {
    const lowStock = await query(`
      SELECT id, name, current_quantity as quantity, min_quantity FROM items WHERE current_quantity <= min_quantity LIMIT 10
    `);
    const pendingInvoices = await query(`
      SELECT id, invoice_number, total FROM sales_invoices WHERE payment_status = 'unpaid' LIMIT 10
    `);
    res.json({ lowStock, pendingInvoices });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/kpi', async (_req: AuthRequest, res: Response) => {
  try {
    // Collection rate: paid invoices / total invoices (by count)
    const invoiceTotals = await queryOne(`
      SELECT
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_invoice_value
      FROM sales_invoices
    `) as any;

    const collectionRate = invoiceTotals?.total_count > 0
      ? Math.round((Number(invoiceTotals.paid_count) / Number(invoiceTotals.total_count)) * 100)
      : 0;

    // Top 5 items by quantity sold
    const topSellingItems = await query(`
      SELECT i.name, i.code, SUM(sii.quantity) as total_qty, SUM(sii.total) as total_revenue
      FROM sales_invoice_items sii
      JOIN items i ON sii.item_id = i.id
      GROUP BY i.id, i.name, i.code
      ORDER BY total_qty DESC
      LIMIT 5
    `);

    // Monthly growth: compare current month vs previous month
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    const prevMonthStart = new Date(currentMonthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(currentMonthStart);
    prevMonthEnd.setDate(0);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const [curMonth, prevMonth] = await Promise.all([
      queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE invoice_date >= $1`, [fmt(currentMonthStart)]),
      queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE invoice_date >= $1 AND invoice_date <= $2`, [fmt(prevMonthStart), fmt(prevMonthEnd)]),
    ]) as any[];

    const curTotal = Number(curMonth?.total || 0);
    const prevTotal = Number(prevMonth?.total || 0);
    const monthlyGrowth = prevTotal > 0 ? Math.round(((curTotal - prevTotal) / prevTotal) * 100 * 10) / 10 : null;

    res.json({
      collection_rate: collectionRate,
      avg_invoice_value: Math.round(Number(invoiceTotals?.avg_invoice_value || 0)),
      total_revenue: Number(invoiceTotals?.total_revenue || 0),
      top_selling_items: topSellingItems,
      monthly_growth: monthlyGrowth,
      current_month_total: curTotal,
      prev_month_total: prevTotal,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
