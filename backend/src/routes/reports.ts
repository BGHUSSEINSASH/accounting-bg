import { Router, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/sales', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, group_by = 'day' } = req.query;
    let dateFormat = "TO_CHAR(invoice_date, 'YYYY-MM-DD')";
    if (group_by === 'month') dateFormat = "TO_CHAR(invoice_date, 'YYYY-MM')";
    if (group_by === 'year') dateFormat = "TO_CHAR(invoice_date, 'YYYY')";
    let sql = `SELECT ${dateFormat} as period, COUNT(*) as invoice_count, SUM(total) as total_sales, SUM(paid_amount) as total_collected, SUM(remaining_amount) as total_remaining FROM sales_invoices WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND invoice_date >= ?'; params.push(from); }
    if (to) { sql += ' AND invoice_date <= ?'; params.push(to); }
    sql += ` GROUP BY period ORDER BY period ASC`;
    const data = await query(sql, params);
    res.json({ data, from: from || 'All time', to: to || 'All time', group_by });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/top-clients', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, limit = 10 } = req.query;
    let sql = `SELECT c.id, c.name, c.phone, COUNT(si.id) as invoice_count, SUM(si.total) as total_purchases, SUM(si.paid_amount) as total_paid, SUM(si.remaining_amount) as total_remaining FROM clients c JOIN sales_invoices si ON c.id = si.client_id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { sql += ' AND si.invoice_date <= ?'; params.push(to); }
    sql += ' GROUP BY c.id, c.name, c.phone ORDER BY total_purchases DESC LIMIT ?';
    params.push(Number(limit));
    const clients = await query(sql, params);
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/top-items', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, limit = 10 } = req.query;
    let sql = `SELECT i.id, i.name, i.code, SUM(sii.quantity) as total_qty, SUM(sii.total) as total_sales FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id JOIN sales_invoices si ON sii.sales_invoice_id = si.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { sql += ' AND si.invoice_date <= ?'; params.push(to); }
    sql += ' GROUP BY i.id, i.name, i.code ORDER BY total_qty DESC LIMIT ?';
    params.push(Number(limit));
    const items = await query(sql, params);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/profit', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT si.invoice_date, si.invoice_number, si.total as revenue, COALESCE(SUM(sii.quantity * i.purchase_price), 0) as cost, (si.total - COALESCE(SUM(sii.quantity * i.purchase_price), 0)) as profit FROM sales_invoices si JOIN sales_invoice_items sii ON si.id = sii.sales_invoice_id JOIN items i ON sii.item_id = i.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND si.invoice_date >= ?'; params.push(from); }
    if (to) { sql += ' AND si.invoice_date <= ?'; params.push(to); }
    sql += ' GROUP BY si.id, si.invoice_date, si.invoice_number, si.total ORDER BY si.invoice_date';
    const data = await query(sql, params);
    const totals: any = data.reduce((acc: any, row: any) => ({
      total_revenue: acc.total_revenue + row.revenue,
      total_cost: acc.total_cost + row.cost,
      total_profit: acc.total_profit + row.profit
    }), { total_revenue: 0, total_cost: 0, total_profit: 0 });
    res.json({ data, ...totals, profit_margin: totals.total_revenue > 0 ? (totals.total_profit / totals.total_revenue * 100) : 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/income-statement-detailed', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;

    const buildPeriodCondition = (alias: string, f: any, t: any, params: any[]) => {
      let cond = '';
      if (f) { cond += ` AND ${alias}.journal_date >= ?`; params.push(f); }
      if (t) { cond += ` AND ${alias}.journal_date <= ?`; params.push(t); }
      return cond;
    };

    // Current period revenues
    const revParams: any[] = [];
    const revCond = buildPeriodCondition('je', from, to, revParams);
    const revenues = await query(
      `SELECT a.code, a.name, SUM(jl.credit - jl.debit) as amount
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON jl.account_id = a.id
       WHERE a.account_type = 'revenue' ${revCond}
       GROUP BY a.id, a.code, a.name
       ORDER BY a.code`,
      revParams
    );

    // Current period expenses
    const expParams: any[] = [];
    const expCond = buildPeriodCondition('je', from, to, expParams);
    const expenses = await query(
      `SELECT a.code, a.name, a.account_type as category, SUM(jl.debit - jl.credit) as amount
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON jl.account_id = a.id
       WHERE a.account_type IN ('expense','cost_of_goods') ${expCond}
       GROUP BY a.id, a.code, a.name, a.account_type
       ORDER BY a.account_type, a.code`,
      expParams
    );

    const totalRevenue = (revenues as any[]).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const cogs = (expenses as any[]).filter((e: any) => e.category === 'cost_of_goods').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const opExpenses = (expenses as any[]).filter((e: any) => e.category === 'expense').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const grossProfit = totalRevenue - cogs;
    const operatingProfit = grossProfit - opExpenses;
    const netProfit = operatingProfit;

    // Previous period comparison (same duration shifted back)
    let prevRevenue = 0;
    let prevNetProfit = 0;
    if (from && to) {
      const fromDate = new Date(String(from));
      const toDate = new Date(String(to));
      const diff = toDate.getTime() - fromDate.getTime();
      const prevTo = new Date(fromDate.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - diff);
      const pf = prevFrom.toISOString().split('T')[0];
      const pt = prevTo.toISOString().split('T')[0];

      const prevRevRows = await query(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as total
         FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id JOIN accounts a ON jl.account_id = a.id
         WHERE a.account_type = 'revenue' AND je.journal_date >= ? AND je.journal_date <= ?`,
        [pf, pt]
      ) as any[];
      prevRevenue = Number(prevRevRows[0]?.total || 0);

      const prevExpRows = await query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as total
         FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id JOIN accounts a ON jl.account_id = a.id
         WHERE a.account_type IN ('expense','cost_of_goods') AND je.journal_date >= ? AND je.journal_date <= ?`,
        [pf, pt]
      ) as any[];
      prevNetProfit = prevRevenue - Number(prevExpRows[0]?.total || 0);
    }

    res.json({
      period: { from: from || null, to: to || null },
      revenues,
      expenses,
      summary: {
        total_revenue: totalRevenue,
        cogs,
        gross_profit: grossProfit,
        gross_margin: totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0,
        operating_expenses: opExpenses,
        operating_profit: operatingProfit,
        net_profit: netProfit,
        net_margin: totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0,
      },
      comparison: {
        prev_revenue: prevRevenue,
        prev_net_profit: prevNetProfit,
        revenue_change: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100) : null,
        profit_change: prevNetProfit !== 0 ? ((netProfit - prevNetProfit) / Math.abs(prevNetProfit) * 100) : null,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/export/:type', async (req: AuthRequest, res: Response) => {
  try {
    let data: any[] = [];
    switch (req.params.type) {
      case 'sales':
        data = await query(`SELECT si.invoice_number, si.invoice_date, c.name as client, u.full_name as sales_rep, si.total, si.paid_amount, si.remaining_amount, si.payment_status
          FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id LEFT JOIN users u ON si.sales_rep_id = u.id ORDER BY si.invoice_date DESC`);
        break;
      case 'clients':
        data = await query('SELECT code, name, phone, email, city, current_balance FROM clients WHERE is_active = 1 ORDER BY name');
        break;
      case 'items':
        data = await query('SELECT code, name, category, current_quantity, min_quantity, purchase_price, selling_price FROM items WHERE is_active = 1 ORDER BY name');
        break;
      case 'attendance':
        data = await query(`SELECT a.date, u.full_name, a.check_in_time, a.check_out_time, a.status, a.late_minutes, a.work_hours
          FROM attendance a JOIN users u ON a.user_id = u.id ORDER BY a.date DESC`);
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
