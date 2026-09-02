import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

function sendWorkbook(res: Response, wb: XLSX.WorkBook, filename: string) {
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: any[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

async function companyInfoAsync(): Promise<any> {
  const info = await queryOne('SELECT * FROM company_info ORDER BY id LIMIT 1') as any;
  const currency = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'base_currency'") as any;
  return { name: info?.name || '', name_en: info?.name_en || '', tax_number: info?.tax_number || '', commercial_registry: info?.commercial_registry || '', address: info?.address || '', phone: info?.phone || '', email: info?.email || '', currency: currency?.setting_value || 'IQD' };
}

router.get('/saf-export', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const info = await companyInfoAsync();
    const period = `${from || 'البداية'} → ${to || 'النهاية'}`;
    const metadata = [
      { 'البند': 'اسم الشركة', 'القيمة': info.name },
      { 'البند': 'الاسم الإنجليزي', 'القيمة': info.name_en },
      { 'البند': 'الرقم الضريبي', 'القيمة': info.tax_number },
      { 'البند': 'السجل التجاري', 'القيمة': info.commercial_registry },
      { 'البند': 'العنوان', 'القيمة': info.address },
      { 'البند': 'الهاتف', 'القيمة': info.phone },
      { 'البند': 'البريد الإلكتروني', 'القيمة': info.email },
      { 'البند': 'العملة الأساسية', 'القيمة': info.currency },
      { 'البند': 'الفترة', 'القيمة': period },
      { 'البند': 'تاريخ الإنشاء', 'القيمة': new Date().toISOString() },
      { 'البند': 'الجهة المولدة', 'القيمة': String(req.user?.id || '') },
    ];
    const salesParams: any[] = []; let salesWhere = '';
    if (from) { salesWhere += ` AND si.invoice_date >= ?`; salesParams.push(from); }
    if (to) { salesWhere += ` AND si.invoice_date <= ?`; salesParams.push(to); }
    const purchaseParams: any[] = []; let purchaseWhere = '';
    if (from) { purchaseWhere += ` AND pi.invoice_date >= ?`; purchaseParams.push(from); }
    if (to) { purchaseWhere += ` AND pi.invoice_date <= ?`; purchaseParams.push(to); }
    const payParams: any[] = []; let payWhere = '';
    if (from) { payWhere += ` AND cp.payment_date >= ?`; payParams.push(from); }
    if (to) { payWhere += ` AND cp.payment_date <= ?`; payParams.push(to); }
    const expParams: any[] = []; let expWhere = '';
    if (from) { expWhere += ` AND e.expense_date >= ?`; expParams.push(from); }
    if (to) { expWhere += ` AND e.expense_date <= ?`; expParams.push(to); }
    const wb = XLSX.utils.book_new();
    addSheet(wb, 'بيانات الملف', metadata);
    addSheet(wb, 'دليل الحسابات', await query('SELECT code, name, type, level, balance, is_active FROM accounts ORDER BY code'));
    addSheet(wb, 'العملاء', await query('SELECT code, name, phone, email, city, tax_number, current_balance, is_active FROM clients ORDER BY code'));
    addSheet(wb, 'الموردون', await query('SELECT code, name, phone, email, city, tax_number, current_balance, is_active FROM suppliers ORDER BY code'));
    addSheet(wb, 'المنتجات', await query('SELECT code, name, category, unit, purchase_price, selling_price, current_quantity, barcode, is_active FROM items ORDER BY code'));
    addSheet(wb, 'فواتير البيع', await query(`
      SELECT si.invoice_number, si.invoice_date, c.name as client_name, u.username as sales_rep,
        si.subtotal, si.discount, si.tax, si.total, si.paid_amount, si.remaining_amount,
        si.payment_status, si.payment_method, si.notes
      FROM sales_invoices si
      LEFT JOIN clients c ON si.client_id = c.id
      LEFT JOIN users u ON si.sales_rep_id = u.id
      WHERE 1=1 ${salesWhere} ORDER BY si.invoice_date`, salesParams));
    addSheet(wb, 'بنود فواتير البيع', await query(`
      SELECT si.invoice_number, i.name as item_name, sii.quantity, sii.unit_price, sii.discount, sii.total
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.sales_invoice_id = si.id
      LEFT JOIN items i ON sii.item_id = i.id
      WHERE 1=1 ${salesWhere} ORDER BY si.invoice_date`, salesParams));
    addSheet(wb, 'فواتير الشراء', await query(`
      SELECT pi.invoice_number, pi.invoice_date, s.name as supplier_name,
        pi.subtotal, pi.discount, pi.tax, pi.total, pi.payment_status, pi.notes
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON pi.supplier_id = s.id
      WHERE 1=1 ${purchaseWhere} ORDER BY pi.invoice_date`, purchaseParams));
    addSheet(wb, 'بنود فواتير الشراء', await query(`
      SELECT pi.invoice_number, i.name as item_name, pii.quantity, pii.unit_price, pii.total
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
      LEFT JOIN items i ON pii.item_id = i.id
      WHERE 1=1 ${purchaseWhere} ORDER BY pi.invoice_date`, purchaseParams));
    addSheet(wb, 'مقبوضات العملاء', await query(`
      SELECT c.name as client_name, cp.amount, cp.payment_date, cp.payment_method, cp.reference_number, cp.notes, u.username as created_by
      FROM client_payments cp
      LEFT JOIN clients c ON cp.client_id = c.id
      LEFT JOIN users u ON cp.created_by = u.id
      WHERE 1=1 ${payWhere} ORDER BY cp.payment_date`, payParams));
    addSheet(wb, 'سداد الموردين', await query(`
      SELECT s.name as supplier_name, sps.amount, sps.due_date, sps.status, sps.notes, sps.reminder_days
      FROM supplier_payment_schedules sps
      LEFT JOIN suppliers s ON sps.supplier_id = s.id
      ORDER BY sps.due_date`));
    addSheet(wb, 'المصروفات', await query(`
      SELECT e.expense_date, e.category, e.description, e.amount, a.name as account_name, u.username as paid_by
      FROM expenses e
      LEFT JOIN accounts a ON e.account_id = a.id
      LEFT JOIN users u ON e.paid_by = u.id
      WHERE 1=1 ${expWhere} ORDER BY e.expense_date`, expParams));
    void logActivityAsync(req.user!.id, 'export_saf', 'report', undefined, 'saf_export');
    sendWorkbook(res, wb, `SAF-${from || 'all'}-${to || 'all'}.xlsx`);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/insurance-export', async (req: AuthRequest, res: Response) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || 0;
    let where = "WHERE p.status IN ('approved', 'paid') AND p.year = ?";
    const params: any[] = [year];
    if (month) { where += ' AND p.month = ?'; params.push(month); }
    const rows = await query(`
      SELECT p.id, u.full_name, u.username, u.department, p.year, p.month, p.basic_salary,
        p.housing_allowance, p.transportation_allowance, p.other_allowances, p.overtime_amount,
        p.gross_salary, p.social_insurance, p.status, p.payment_date
      FROM payroll p
      JOIN users u ON p.user_id = u.id
      ${where}
      ORDER BY p.year, p.month, u.full_name
    `, params) as any[];
    const EMPLOYER_RATE = 0.0975;
    const data = rows.map(r => {
      const wages = Number(r.gross_salary || 0);
      const employeeShare = Number(r.social_insurance || 0);
      const employerShare = Math.round(wages * EMPLOYER_RATE * 100) / 100;
      return { 'رقم الموظف': r.username, 'اسم الموظف': r.full_name, 'الإدارة': r.department || '', 'السنة': r.year, 'الشهر': r.month, 'الأجور الخاضعة': wages, 'حصة الموظف (9.75%)': employeeShare, 'حصة صاحب العمل (9.75%)': employerShare, 'إجمالي الاشتراك': Math.round((employeeShare + employerShare) * 100) / 100, 'الحالة': r.status, 'تاريخ الصرف': r.payment_date || '' };
    });
    const totalWages = data.reduce((s, r) => s + r['الأجور الخاضعة'], 0);
    const totalEmployee = data.reduce((s, r) => s + r['حصة الموظف (9.75%)'], 0);
    const totalEmployer = data.reduce((s, r) => s + r['حصة صاحب العمل (9.75%)'], 0);
    const info = await companyInfoAsync();
    const metadata = [
      { 'البند': 'اسم الشركة', 'القيمة': info.name }, { 'البند': 'الرقم الضريبي', 'القيمة': info.tax_number },
      { 'البند': 'السجل التجاري', 'القيمة': info.commercial_registry }, { 'البند': 'السنة', 'القيمة': String(year) },
      { 'البند': 'الشهر', 'القيمة': month ? String(month) : 'كل الشهور' }, { 'البند': 'تاريخ الإنشاء', 'القيمة': new Date().toISOString() },
    ];
    const wb = XLSX.utils.book_new();
    addSheet(wb, 'بيانات الملف', metadata);
    addSheet(wb, 'التأمينات الاجتماعية', data);
    addSheet(wb, 'الإجماليات', [{ 'رقم الموظف': '', 'اسم الموظف': 'الإجمالي', 'الإدارة': '', 'السنة': '', 'الشهر': '', 'الأجور الخاضعة': Math.round(totalWages * 100) / 100, 'حصة الموظف (9.75%)': Math.round(totalEmployee * 100) / 100, 'حصة صاحب العمل (9.75%)': Math.round(totalEmployer * 100) / 100, 'إجمالي الاشتراك': Math.round((totalEmployee + totalEmployer) * 100) / 100, 'الحالة': '', 'تاريخ الصرف': '' }]);
    void logActivityAsync(req.user!.id, 'export_insurance', 'report', undefined, `insurance_${year}_${month}`);
    sendWorkbook(res, wb, `insurance-${year}-${month || 'all'}.xlsx`);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/forecast', async (req: AuthRequest, res: Response) => {
  try {
    const { months = 3 } = req.query;
    const n = Math.max(1, parseInt(String(months)) || 3);
    const rows = await query(`
      SELECT TO_CHAR(invoice_date, 'YYYY-MM') as month, SUM(total) as revenue
      FROM sales_invoices
      GROUP BY TO_CHAR(invoice_date, 'YYYY-MM') ORDER BY month
    `) as any[];
    const series = rows.map(r => ({ month: r.month, value: Number(r.revenue || 0) }));
    const values = series.map(s => s.value);
    const lastMonth = series.length ? series[series.length - 1].month : new Date().toISOString().slice(0, 7);
    let nextValue = 0;
    const forecastMonths: string[] = [];
    if (values.length >= 2) {
      const x = values.map((_, i) => i);
      const n2 = values.length;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = values.reduce((a, b) => a + b, 0);
      const sumXY = values.reduce((a, v, i) => a + v * i, 0);
      const sumX2 = x.reduce((a, b) => a + b * b, 0);
      const slope = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX || 1);
      const intercept = (sumY - slope * sumX) / n2;
      const lastIndex = values.length - 1;
      for (let k = 1; k <= n; k++) {
        nextValue = Math.max(0, intercept + slope * (lastIndex + k));
        const [y, m] = addMonths(lastMonth, k);
        forecastMonths.push(`${y}-${m}`);
      }
    } else {
      const base = values[values.length - 1] || 0;
      for (let k = 1; k <= n; k++) {
        const [y, m] = addMonths(lastMonth, k);
        forecastMonths.push(`${y}-${m}`);
      }
      nextValue = base;
    }
    res.json({ series, forecastMonths, forecastValues: Array(n).fill(nextValue), lastMonth });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

function addMonths(ym: string, count: number): [number, string] {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + count;
  return [Math.floor(total / 12), String((total % 12) + 1).padStart(2, '0')];
}

router.get('/margin-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const params: any[] = [from || '1900-01-01', to || '2999-12-31'];
    const rows = await query(`
      SELECT i.id, i.name, i.category, i.purchase_price, i.selling_price,
        COALESCE(SUM(sii.quantity), 0) as qty,
        COALESCE(SUM(sii.total), 0) as revenue
      FROM items i
      LEFT JOIN sales_invoice_items sii ON sii.item_id = i.id
      LEFT JOIN sales_invoices si ON si.id = sii.sales_invoice_id AND si.payment_status IN ('paid','partial') AND si.invoice_date >= ? AND si.invoice_date <= ?
      GROUP BY i.id
      HAVING COALESCE(SUM(sii.total), 0) > 0
      ORDER BY revenue DESC
    `, params) as any[];
    const data = rows.map((r: any) => {
      const revenue = Number(r.revenue || 0);
      const qty = Number(r.qty || 0);
      const avgPrice = qty > 0 ? revenue / qty : Number(r.selling_price || 0);
      const costPerUnit = Number(r.purchase_price || 0);
      const cost = qty * costPerUnit;
      const margin = revenue - cost;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
      return { ...r, avg_price: avgPrice, cost, margin, margin_pct: Math.round(marginPct * 10) / 10 };
    });
    const totalRevenue = data.reduce((s, r) => s + r.revenue, 0);
    const totalCost = data.reduce((s, r) => s + r.cost, 0);
    const totalMargin = totalRevenue - totalCost;
    const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    res.json({ rows: data, summary: { totalRevenue, totalCost, totalMargin, totalMarginPct: Math.round(totalMarginPct * 10) / 10 } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/season-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`
      SELECT EXTRACT(MONTH FROM invoice_date)::INTEGER as month_num,
        TO_CHAR(invoice_date, 'YYYY') as year,
        SUM(total) as revenue
      FROM sales_invoices
      GROUP BY year, month_num
      ORDER BY year, month_num
    `) as any[];
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const monthly: any[] = [];
    for (let m = 1; m <= 12; m++) {
      const entries = rows.filter(r => r.month_num === m);
      const avg = entries.length ? entries.reduce((s, r) => s + Number(r.revenue || 0), 0) / entries.length : 0;
      const last = entries.length ? Number(entries[entries.length - 1].revenue || 0) : 0;
      monthly.push({ month_num: m, month_name: monthNames[m - 1], avg_revenue: avg, last_revenue: last, count: entries.length });
    }
    const overallAvg = monthly.reduce((s, m) => s + m.avg_revenue, 0) / Math.max(monthly.filter(m => m.count > 0).length, 1);
    const enriched = monthly.map(m => ({ ...m, seasonality_index: overallAvg > 0 ? Math.round((m.avg_revenue / overallAvg) * 100) / 100 : 0 }));
    res.json({ monthly: enriched, overall_avg: overallAvg, by_year: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/scheduled', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`
      SELECT sr.*, u.username as created_by_name
      FROM scheduled_reports sr LEFT JOIN users u ON sr.created_by = u.id
      ORDER BY sr.created_at DESC
    `);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/scheduled', async (req: AuthRequest, res: Response) => {
  try {
    const { name, report_type, frequency, recipients_email, day_of_week, day_of_month } = req.body;
    if (!name || !report_type || !frequency) return res.status(400).json({ error: 'الاسم والنوع والتكرار مطلوبة' });
    const result = await execute('INSERT INTO scheduled_reports (name, report_type, frequency, recipients_email, day_of_week, day_of_month, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [name, report_type, frequency, recipients_email || null, day_of_week || null, day_of_month || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_scheduled_report', 'scheduled_report', result.id as number);
    res.json({ message: 'تم جدولة التقرير', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/scheduled/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { is_active } = req.body;
    await execute('UPDATE scheduled_reports SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/scheduled/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM scheduled_reports WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
