import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.post('/calculate', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { month, year } = req.body;

    const employees = db.prepare(`
      SELECT u.id, u.full_name, ec.basic_salary, ec.housing_allowance, ec.transportation_allowance, ec.insurance_deduction
      FROM users u
      LEFT JOIN employee_contracts ec ON ec.user_id = u.id AND ec.status = 'active'
      WHERE u.is_active = 1
    `).all() as any[];

    const payrollItems = employees.map((emp: any) => {
      const basic = emp.basic_salary || 0;
      const housing = emp.housing_allowance || 0;
      const transport = emp.transportation_allowance || 0;
      const insurance = emp.insurance_deduction || 0;

      const overtime = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM overtime_records WHERE employee_id = ? AND strftime('%m', date) = ? AND strftime('%Y', date) = ? AND approved = 1`).get(emp.id, String(month).padStart(2,'0'), String(year)) as any;

      const deductions = db.prepare(`SELECT COALESCE(SUM(deduction_amount), 0) as total FROM attendance_deductions WHERE employee_id = ? AND month = ? AND year = ?`).get(emp.id, month, year) as any;

      const gross = basic + housing + transport + (overtime?.total || 0);
      const totalDeductions = insurance + (deductions?.total || 0);
      const net = gross - totalDeductions;

      return {
        employee_id: emp.id,
        employee_name: emp.full_name,
        basic_salary: basic,
        housing_allowance: housing,
        transportation_allowance: transport,
        overtime: overtime?.total || 0,
        insurance_deduction: insurance,
        attendance_deductions: deductions?.total || 0,
        gross,
        total_deductions: totalDeductions,
        net_salary: Math.max(0, net)
      };
    });

    res.json({ month, year, employees: payrollItems, total: payrollItems.reduce((s: number, i: any) => s + i.net_salary, 0) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
