import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import bcrypt from 'bcryptjs';
import { generateCodeAsync } from '../utils/helpers';

const router = Router();
router.use(authenticate);

// â”€â”€â”€ GET /employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/employees', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { department, role, search, is_active } = req.query;
    let sql = `
      SELECT
        u.id, u.username, u.full_name, u.email, u.phone, u.role, u.department,
        u.is_active, u.position, u.hire_date, u.national_id, u.iban, u.bank_name,
        COALESCE(u.basic_salary, 0)               AS basic_salary,
        COALESCE(u.housing_allowance, 0)          AS housing_allowance,
        COALESCE(u.transportation_allowance, 0)   AS transportation_allowance,
        COALESCE(u.insurance_deduction, 0)        AS insurance_deduction,
        COALESCE(u.basic_salary, 0)
          + COALESCE(u.housing_allowance, 0)
          + COALESCE(u.transportation_allowance, 0) AS total_salary,
        COALESCE(u.basic_salary, 0)
          + COALESCE(u.housing_allowance, 0)
          + COALESCE(u.transportation_allowance, 0)
          - COALESCE(u.insurance_deduction, 0)      AS net_salary,
        u.created_at,
        -- last active contract info
        ec.contract_type, ec.start_date AS contract_start_date, ec.end_date AS contract_end_date,
        ec.status AS contract_status
      FROM users u
      LEFT JOIN employee_contracts ec
        ON ec.user_id = u.id AND ec.status = 'active'
      WHERE 1=1`;
    const params: any[] = [];
    if (department) { sql += ' AND u.department = ?'; params.push(department); }
    if (role)        { sql += ' AND u.role = ?'; params.push(role); }
    if (is_active !== undefined) { sql += ' AND u.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    if (search) {
      sql += ' AND (u.full_name ILIKE ? OR u.username ILIKE ? OR u.email ILIKE ? OR u.position ILIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    sql += ' ORDER BY u.full_name ASC';
    const employees = await query(sql, params);
    res.json({ employees, total: employees.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ GET /employees/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const emp = await queryOne(`
      SELECT
        u.id, u.username, u.full_name, u.email, u.phone, u.role, u.department,
        u.is_active, u.position, u.hire_date, u.national_id, u.iban, u.bank_name,
        COALESCE(u.basic_salary, 0)               AS basic_salary,
        COALESCE(u.housing_allowance, 0)          AS housing_allowance,
        COALESCE(u.transportation_allowance, 0)   AS transportation_allowance,
        COALESCE(u.insurance_deduction, 0)        AS insurance_deduction,
        COALESCE(u.basic_salary, 0)
          + COALESCE(u.housing_allowance, 0)
          + COALESCE(u.transportation_allowance, 0) AS total_salary,
        COALESCE(u.basic_salary, 0)
          + COALESCE(u.housing_allowance, 0)
          + COALESCE(u.transportation_allowance, 0)
          - COALESCE(u.insurance_deduction, 0)      AS net_salary,
        u.created_at
      FROM users u WHERE u.id = ?`, [req.params.id]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Attach active contract
    const contract = await queryOne(
      `SELECT * FROM employee_contracts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );

    // Latest salary history
    const salaryHistory = await query(
      `SELECT sh.*, u.full_name AS changed_by_name
       FROM salary_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.user_id = ? ORDER BY sh.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...emp, active_contract: contract || null, salary_history: salaryHistory });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ POST /employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/employees', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      username, password, full_name, email, phone, role, department,
      position, hire_date, national_id, iban, bank_name,
      basic_salary = 0, housing_allowance = 0,
      transportation_allowance = 0, insurance_deduction = 0,
    } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙˆÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙˆØ§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ø·Ù„ÙˆØ¨Ø©' });
    }
    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù…ÙˆØ¬ÙˆØ¯ Ù…Ø³Ø¨Ù‚Ø§Ù‹' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await execute(
      `INSERT INTO users
         (username, password_hash, full_name, email, phone, role, department,
          position, hire_date, national_id, iban, bank_name,
          basic_salary, housing_allowance, transportation_allowance, insurance_deduction,
          is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [username, hash, full_name, email || null, phone || null, role || 'employee',
       department || null, position || null, hire_date || null, national_id || null,
       iban || null, bank_name || null,
       Number(basic_salary), Number(housing_allowance),
       Number(transportation_allowance), Number(insurance_deduction)]
    );

    // Record initial salary history if salary provided
    if (Number(basic_salary) > 0) {
      await execute(
        `INSERT INTO salary_history (user_id, old_basic_salary, new_basic_salary,
           old_housing_allowance, new_housing_allowance,
           old_transportation_allowance, new_transportation_allowance,
           change_reason, effective_date, changed_by)
         VALUES (?, 0, ?, 0, ?, 0, ?, 'Ø±Ø§ØªØ¨ Ø£ÙˆÙ„ÙŠ Ø¹Ù†Ø¯ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡', ?, ?)`,
        [result.id, Number(basic_salary), Number(housing_allowance),
         Number(transportation_allowance), hire_date || new Date().toISOString().split('T')[0],
         req.user!.id]
      );
    }

    void logActivityAsync(req.user!.id, 'create_employee', 'users', result.id);
    res.status(201).json({ id: result.id, message: 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…ÙˆØ¸Ù Ø¨Ù†Ø¬Ø§Ø­' });
  } catch (err: any) {
    if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
      return res.status(409).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù…ÙˆØ¬ÙˆØ¯ Ù…Ø³Ø¨Ù‚Ø§Ù‹' });
    }
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ PUT /employees/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.put('/employees/:id', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      full_name, email, phone, role, department, is_active,
      position, hire_date, national_id, iban, bank_name,
      basic_salary, housing_allowance, transportation_allowance, insurance_deduction,
    } = req.body;

    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]) as any;
    if (!existing) return res.status(404).json({ error: 'Ø§Ù„Ù…ÙˆØ¸Ù ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' });

    await execute(
      `UPDATE users SET
         full_name                  = COALESCE(?, full_name),
         email                      = COALESCE(?, email),
         phone                      = COALESCE(?, phone),
         role                       = COALESCE(?, role),
         department                 = COALESCE(?, department),
         position                   = COALESCE(?, position),
         hire_date                  = COALESCE(?, hire_date),
         national_id                = COALESCE(?, national_id),
         iban                       = COALESCE(?, iban),
         bank_name                  = COALESCE(?, bank_name),
         basic_salary               = COALESCE(?, basic_salary),
         housing_allowance          = COALESCE(?, housing_allowance),
         transportation_allowance   = COALESCE(?, transportation_allowance),
         insurance_deduction        = COALESCE(?, insurance_deduction),
         is_active                  = COALESCE(?, is_active),
         updated_at                 = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [full_name, email, phone, role, department, position, hire_date,
       national_id, iban, bank_name,
       basic_salary !== undefined ? Number(basic_salary) : null,
       housing_allowance !== undefined ? Number(housing_allowance) : null,
       transportation_allowance !== undefined ? Number(transportation_allowance) : null,
       insurance_deduction !== undefined ? Number(insurance_deduction) : null,
       is_active !== undefined ? (is_active ? 1 : 0) : null,
       req.params.id]
    );

    void logActivityAsync(req.user!.id, 'update_employee', 'users', parseInt(req.params.id));
    res.json({ message: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…ÙˆØ¸Ù Ø¨Ù†Ø¬Ø§Ø­' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ DELETE /employees/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/employees/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (parseInt(req.params.id) === req.user!.id) {
      return res.status(400).json({ error: 'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø­Ø°Ù Ø­Ø³Ø§Ø¨Ùƒ Ø§Ù„Ø®Ø§Øµ' });
    }
    await execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_employee', 'users', parseInt(req.params.id));
    res.json({ message: 'ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…ÙˆØ¸Ù' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ GET /employees/:id/salary-history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/employees/:id/salary-history', async (req: AuthRequest, res: Response) => {
  try {
    const history = await query(
      `SELECT sh.*, u.full_name AS changed_by_name
       FROM salary_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.user_id = ?
       ORDER BY sh.created_at DESC`,
      [req.params.id]
    );
    res.json(history);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ POST /employees/:id/salary-increase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/employees/:id/salary-increase', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const emp = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]) as any;
    if (!emp) return res.status(404).json({ error: 'Ø§Ù„Ù…ÙˆØ¸Ù ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' });

    const {
      new_basic_salary,
      new_housing_allowance,
      new_transportation_allowance,
      change_reason,
      effective_date,
    } = req.body;

    if (new_basic_salary === undefined || new_basic_salary === null) {
      return res.status(400).json({ error: 'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ Ø§Ù„Ø¬Ø¯ÙŠØ¯ Ù…Ø·Ù„ÙˆØ¨' });
    }

    // Record history
    await execute(
      `INSERT INTO salary_history
         (user_id, old_basic_salary, new_basic_salary,
          old_housing_allowance, new_housing_allowance,
          old_transportation_allowance, new_transportation_allowance,
          change_reason, effective_date, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        Number(emp.basic_salary || 0), Number(new_basic_salary),
        Number(emp.housing_allowance || 0),
        new_housing_allowance !== undefined ? Number(new_housing_allowance) : Number(emp.housing_allowance || 0),
        Number(emp.transportation_allowance || 0),
        new_transportation_allowance !== undefined ? Number(new_transportation_allowance) : Number(emp.transportation_allowance || 0),
        change_reason || 'Ø²ÙŠØ§Ø¯Ø© Ø±Ø§ØªØ¨',
        effective_date || new Date().toISOString().split('T')[0],
        req.user!.id,
      ]
    );

    // Update user record
    await execute(
      `UPDATE users SET
         basic_salary             = ?,
         housing_allowance        = COALESCE(?, housing_allowance),
         transportation_allowance = COALESCE(?, transportation_allowance),
         updated_at               = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        Number(new_basic_salary),
        new_housing_allowance !== undefined ? Number(new_housing_allowance) : null,
        new_transportation_allowance !== undefined ? Number(new_transportation_allowance) : null,
        req.params.id,
      ]
    );

    const oldNet = Number(emp.basic_salary || 0) + Number(emp.housing_allowance || 0) + Number(emp.transportation_allowance || 0);
    const newBasic = Number(new_basic_salary);
    const newHousing = new_housing_allowance !== undefined ? Number(new_housing_allowance) : Number(emp.housing_allowance || 0);
    const newTransport = new_transportation_allowance !== undefined ? Number(new_transportation_allowance) : Number(emp.transportation_allowance || 0);
    const newNet = newBasic + newHousing + newTransport;
    const increase = newNet - oldNet;
    const increasePercent = oldNet > 0 ? ((increase / oldNet) * 100).toFixed(2) : '0';

    void logActivityAsync(req.user!.id, 'salary_increase', 'users', parseInt(req.params.id),
      `Ø²ÙŠØ§Ø¯Ø© Ø±Ø§ØªØ¨: Ù…Ù† ${oldNet} Ø¥Ù„Ù‰ ${newNet} (${increasePercent}%)`);

    res.json({
      message: 'ØªÙ… Ø±ÙØ¹ Ø§Ù„Ø±Ø§ØªØ¨ Ø¨Ù†Ø¬Ø§Ø­',
      old_total: oldNet,
      new_total: newNet,
      increase_amount: increase,
      increase_percent: increasePercent,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ GET /departments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/departments', async (_req: AuthRequest, res: Response) => {
  try {
    const departments = [
      { value: 'admin', name: 'Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©' },
      { value: 'sales', name: 'Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª' },
      { value: 'accounting', name: 'Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø©' },
      { value: 'inventory', name: 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ†' },
      { value: 'hr', name: 'Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©' },
    ];
    const used = await query(
      `SELECT department, COUNT(*) as count FROM users WHERE department IS NOT NULL AND is_active = 1 GROUP BY department`
    ) as any[];
    const countMap = Object.fromEntries(used.map((u: any) => [u.department, u.count]));
    res.json(departments.map(d => ({ ...d, count: countMap[d.value] || 0 })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// â”€â”€â”€ GET /stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/stats', authorize('admin', 'manager', 'accountant'), async (_req: AuthRequest, res: Response) => {
  try {
    const [totalRow, activeRow, deptRows, avgSalaryRow] = await Promise.all([
      queryOne('SELECT COUNT(*) AS count FROM users') as Promise<any>,
      queryOne('SELECT COUNT(*) AS count FROM users WHERE is_active = 1') as Promise<any>,
      query(`SELECT department, COUNT(*) AS count FROM users WHERE is_active = 1 GROUP BY department ORDER BY count DESC`) as Promise<any[]>,
      queryOne('SELECT AVG(COALESCE(basic_salary,0)) AS avg FROM users WHERE is_active = 1') as Promise<any>,
    ]);
    res.json({
      total: totalRow?.count || 0,
      active: activeRow?.count || 0,
      by_department: deptRows,
      avg_salary: Number(avgSalaryRow?.avg || 0).toFixed(2),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


