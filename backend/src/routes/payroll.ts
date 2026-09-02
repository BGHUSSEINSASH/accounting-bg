import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, user_id, status } = req.query;
    const currentDate = new Date();
    const m = month ? parseInt(month as string) : currentDate.getMonth() + 1;
    const y = year ? parseInt(year as string) : currentDate.getFullYear();
    let sql = `SELECT p.*, u.full_name, u.department, u.position
      FROM payroll p JOIN users u ON p.user_id = u.id
      WHERE p.month = ? AND p.year = ?`;
    const params: any[] = [m, y];
    if (user_id) { sql += ' AND p.user_id = ?'; params.push(user_id); }
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    sql += ' ORDER BY u.full_name';
    const records = await query(sql, params);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/generate', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.body;
    const currentDate = new Date();
    const m = month ? parseInt(month) : currentDate.getMonth() + 1;
    const y = year ? parseInt(year) : currentDate.getFullYear();
    const employees = await query(`
      SELECT u.*,
        COALESCE(ec.basic_salary, u.basic_salary, 0) as eff_basic,
        COALESCE(ec.housing_allowance, u.housing_allowance, 0) as eff_housing,
        COALESCE(ec.transportation_allowance, u.transportation_allowance, 0) as eff_transport,
        COALESCE(ec.insurance_deduction, 0) as eff_insurance
      FROM users u
      LEFT JOIN employee_contracts ec ON ec.user_id = u.id AND ec.status = 'active'
      WHERE u.is_active = 1
    `) as any[];

    let created = 0;
    for (const emp of employees) {
      const existing = await queryOne('SELECT id FROM payroll WHERE user_id = ? AND month = ? AND year = ?', [emp.id, m, y]);
      if (existing) continue;
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
      const absRow = await queryOne(`SELECT COUNT(*) as cnt FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? AND status = 'absent'`, [emp.id, startDate, endDate]) as any;
      const absenceDays = absRow?.cnt || 0;
      const dailySalary = (emp.eff_basic || 0) / 26;
      const absenceDeduction = absenceDays * dailySalary;
      const overtimeRow = await queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM overtime_records WHERE employee_id = ? AND TO_CHAR(date, 'MM') = ? AND TO_CHAR(date, 'YYYY') = ? AND approved = 1`,
        [emp.id, String(m).padStart(2, '0'), String(y)]) as any;
      const overtimeAmount = overtimeRow?.total || 0;
      const loanRow = await queryOne(`SELECT COALESCE(SUM(monthly_deduction), 0) as total FROM employee_loans WHERE user_id = ? AND status = 'active'`, [emp.id]) as any;
      const loanDeduction = loanRow?.total || 0;
      const gross = (emp.eff_basic || 0) + (emp.eff_housing || 0) + (emp.eff_transport || 0) + overtimeAmount;
      const totalDeductions = (emp.eff_insurance || 0) + absenceDeduction + loanDeduction;
      const net = Math.max(0, gross - totalDeductions);
      await execute(`INSERT INTO payroll (user_id, month, year, basic_salary, housing_allowance, transportation_allowance, overtime_amount, gross_salary, social_insurance, loan_deduction, absence_deduction, net_salary, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [emp.id, m, y, emp.eff_basic || 0, emp.eff_housing || 0, emp.eff_transport || 0, overtimeAmount, gross, emp.eff_insurance || 0, loanDeduction, absenceDeduction, net, req.user!.id]);
      created++;
    }
    void logActivityAsync(req.user!.id, 'generate_payroll', 'payroll');
    res.json({ message: `تم توليد ${created} كشف راتب`, month: m, year: y });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const record = await queryOne(`SELECT p.*, u.full_name, u.department, u.position, u.iban, u.bank_name FROM payroll p JOIN users u ON p.user_id = u.id WHERE p.id = ?`, [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const rec = await queryOne('SELECT * FROM payroll WHERE id = ?', [req.params.id]) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.status !== 'draft') return res.status(400).json({ error: 'لا يمكن تعديل كشف راتب معتمد' });
    const { basic_salary, housing_allowance, transportation_allowance, other_allowances, overtime_amount, social_insurance, tax_deduction, loan_deduction, absence_deduction, other_deductions, notes } = req.body;
    const gross = (basic_salary ?? rec.basic_salary) + (housing_allowance ?? rec.housing_allowance) + (transportation_allowance ?? rec.transportation_allowance) + (other_allowances ?? rec.other_allowances ?? 0) + (overtime_amount ?? rec.overtime_amount ?? 0);
    const deductions = (social_insurance ?? rec.social_insurance ?? 0) + (tax_deduction ?? rec.tax_deduction ?? 0) + (loan_deduction ?? rec.loan_deduction ?? 0) + (absence_deduction ?? rec.absence_deduction ?? 0) + (other_deductions ?? rec.other_deductions ?? 0);
    const net = Math.max(0, gross - deductions);
    await execute(`UPDATE payroll SET basic_salary=COALESCE(?,basic_salary), housing_allowance=COALESCE(?,housing_allowance), transportation_allowance=COALESCE(?,transportation_allowance), other_allowances=COALESCE(?,other_allowances), overtime_amount=COALESCE(?,overtime_amount), gross_salary=?, social_insurance=COALESCE(?,social_insurance), tax_deduction=COALESCE(?,tax_deduction), loan_deduction=COALESCE(?,loan_deduction), absence_deduction=COALESCE(?,absence_deduction), other_deductions=COALESCE(?,other_deductions), net_salary=?, notes=COALESCE(?,notes) WHERE id=?`,
      [basic_salary, housing_allowance, transportation_allowance, other_allowances, overtime_amount, gross, social_insurance, tax_deduction, loan_deduction, absence_deduction, other_deductions, net, notes, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_payroll', 'payroll', parseInt(req.params.id));
    res.json({ message: 'تم التحديث', net_salary: net });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE payroll SET status = 'approved' WHERE id = ? AND status = 'draft'", [req.params.id]);
    void logActivityAsync(req.user!.id, 'approve_payroll', 'payroll', parseInt(req.params.id));
    res.json({ message: 'تم الاعتماد' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/pay', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { payment_date, payment_method } = req.body;
    const rec = await queryOne('SELECT * FROM payroll WHERE id = ?', [req.params.id]) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.status !== 'approved') return res.status(400).json({ error: 'يجب اعتماد كشف الراتب أولاً' });
    await execute("UPDATE payroll SET status = 'paid', payment_date = ?, payment_method = ? WHERE id = ?",
      [payment_date || new Date().toISOString().split('T')[0], payment_method || 'transfer', req.params.id]);
    void logActivityAsync(req.user!.id, 'pay_payroll', 'payroll', parseInt(req.params.id));
    res.json({ message: 'تم تسجيل الصرف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const rec = await queryOne('SELECT * FROM payroll WHERE id = ?', [req.params.id]) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.status === 'paid') return res.status(400).json({ error: 'لا يمكن حذف راتب مدفوع' });
    await execute('DELETE FROM payroll WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
