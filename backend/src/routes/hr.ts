import { Router, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/employees', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { department, role, search } = req.query;
    let sql = `SELECT id, username, full_name, email, phone, role, department, is_active, position, basic_salary, housing_allowance, transportation_allowance
      FROM users WHERE 1=1`;
    const params: any[] = [];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    if (search) { sql += ' AND (full_name LIKE ? OR username LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY full_name ASC';
    const employees = await query(sql, params);
    res.json({ employees });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/departments', async (_req: AuthRequest, res: Response) => {
  try {
    const departments = [
      { value: 'admin', name: 'الإدارة' },
      { value: 'sales', name: 'المبيعات' },
      { value: 'accounting', name: 'المحاسبة' },
      { value: 'inventory', name: 'المخزون' },
      { value: 'hr', name: 'الموارد البشرية' },
    ];
    const used = await query("SELECT DISTINCT department FROM users WHERE department IS NOT NULL") as any[];
    const usedValues = used.map((u: any) => u.department);
    const result = departments.map(d => ({ ...d, has_employees: usedValues.includes(d.value), count: usedValues.filter((v: any) => v === d.value).length }));
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
