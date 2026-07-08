import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// Sales report
router.get('/sales', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, group_by = 'day' } = req.query;
    let dateFormat = "strftime('%Y-%m-%d', invoice_date)";
    if (group_by === 'month') dateFormat = "strftime('%Y-%m', invoice_date)";
    if (group_by === 'year') dateFormat = "strftime('%Y', invoice_date)";
    let query = `SELECT ${dateFormat} as period, COUNT(*) as invoice_count, SUM(total) as total_sales, SUM(paid_amount) as total_collected, SUM(remaining_amount) as total_remaining FROM sales_invoices WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND invoice_date >= ?'; params.push(from); }
    if (to) { query += ' AND invoice_date <= ?'; params.push(to); }
    query += ` GROUP BY period ORDER BY period ASC`;
    const data = db.prepare(query).all(...params);
    res.json({ data, from: from || 'All time', to: to || 'All time', group_by });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Top clients
router.get('/top-clients', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, limit = 10 } = req.query;
    let query = `SELECT c.id, c.name, c.phone, COUNT(si.id) as invoice_count, SUM(si.total) as total_purchases, SUM(si.paid_amount) as total_paid, SUM(si.remaining_amount) as total_remaining FROM clients c JOIN sales_invoices si ON c.id = si.client_id WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { query += ' AND si.invoice_date <= ?'; params.push(to); }
    query += ' GROUP BY c.id, c.name, c.phone ORDER BY total_purchases DESC LIMIT ?';
    params.push(Number(limit));
    const clients = db.prepare(query).all(...params);
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Top items
router.get('/top-items', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, limit = 10 } = req.query;
    let query = `SELECT i.id, i.name, i.code, SUM(sii.quantity) as total_qty, SUM(sii.total) as total_sales FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id JOIN sales_invoices si ON sii.sales_invoice_id = si.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { query += ' AND si.invoice_date <= ?'; params.push(to); }
    query += ' GROUP BY i.id, i.name, i.code ORDER BY total_qty DESC LIMIT ?';
    params.push(Number(limit));
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Profit report
router.get('/profit', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let query = `SELECT si.invoice_date, si.invoice_number, si.total as revenue, COALESCE(SUM(sii.quantity * i.purchase_price), 0) as cost, (si.total - COALESCE(SUM(sii.quantity * i.purchase_price), 0)) as profit FROM sales_invoices si JOIN sales_invoice_items sii ON si.id = sii.sales_invoice_id JOIN items i ON sii.item_id = i.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { query += ' AND si.invoice_date <= ?'; params.push(to); }
    query += ' GROUP BY si.id, si.invoice_date, si.invoice_number, si.total ORDER BY si.invoice_date';
    const data = db.prepare(query).all(...params);
    const totals: any = data.reduce((acc: any, row: any) => ({
      total_revenue: acc.total_revenue + row.revenue,
      total_cost: acc.total_cost + row.cost,
      total_profit: acc.total_profit + row.profit
    }), { total_revenue: 0, total_cost: 0, total_profit: 0 });
    res.json({ data, ...totals, profit_margin: totals.total_revenue > 0 ? (totals.total_profit / totals.total_revenue * 100) : 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Export report data
router.get('/export/:type', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let data: any[] = [];
    switch (req.params.type) {
      case 'sales':
        data = db.prepare(`SELECT si.invoice_number, si.invoice_date, c.name as client, u.full_name as sales_rep, si.total, si.paid_amount, si.remaining_amount, si.payment_status
          FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id ORDER BY si.invoice_date DESC`).all();
        break;
      case 'clients':
        data = db.prepare('SELECT code, name, phone, email, city, current_balance FROM clients WHERE is_active = 1 ORDER BY name').all();
        break;
      case 'items':
        data = db.prepare('SELECT code, name, category, current_quantity, min_quantity, purchase_price, selling_price FROM items WHERE is_active = 1 ORDER BY name').all();
        break;
      case 'attendance':
        data = db.prepare(`SELECT a.date, u.full_name, a.check_in_time, a.check_out_time, a.status, a.late_minutes, a.work_hours
          FROM attendance a JOIN users u ON a.user_id = u.id ORDER BY a.date DESC`).all();
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


