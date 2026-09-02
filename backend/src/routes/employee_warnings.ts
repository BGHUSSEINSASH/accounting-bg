import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, employee_id, status, warning_type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT w.*, e.full_name as employee_name, i.full_name as issued_by_name FROM employee_warnings w JOIN users e ON w.employee_id = e.id LEFT JOIN users i ON w.issued_by = i.id WHERE 1=1`;
    const params: any[] = [];
    if (employee_id) { sql += ` AND w.employee_id = ?`; params.push(employee_id); }
    if (status) { sql += ` AND w.status = ?`; params.push(status); }
    if (warning_type) { sql += ` AND w.warning_type = ?`; params.push(warning_type); }
    const countRow = await queryOne(sql.replace('w.*, e.full_name as employee_name, i.full_name as issued_by_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ` ORDER BY w.issue_date DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const warnings = await query(sql, params);
    res.json({ warnings, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/employee/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const warnings = await query(`SELECT w.*, e.full_name as employee_name, i.full_name as issued_by_name FROM employee_warnings w JOIN users e ON w.employee_id = e.id LEFT JOIN users i ON w.issued_by = i.id WHERE w.employee_id = ? ORDER BY w.issue_date DESC`, [req.params.employeeId]);
    res.json(warnings);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const warning = await queryOne(`SELECT w.*, e.full_name as employee_name, i.full_name as issued_by_name FROM employee_warnings w JOIN users e ON w.employee_id = e.id LEFT JOIN users i ON w.issued_by = i.id WHERE w.id = ?`, [req.params.id]);
    if (!warning) return res.status(404).json({ error: 'Warning not found' });
    res.json(warning);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, warning_type, issue_date, points, reason, action_plan, status } = req.body;
    if (!employee_id || !issue_date || !reason) return res.status(400).json({ error: 'employee_id, issue_date, and reason are required' });
    const result = await execute(`INSERT INTO employee_warnings (employee_id, warning_type, issue_date, points, reason, action_plan, issued_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, warning_type || 'verbal', issue_date, points || 0, reason, action_plan || null, req.user!.id, status || 'open']);
    void logActivityAsync(req.user!.id, 'create_warning', 'employee_warnings', result.id as number);
    res.status(201).json({ id: result.id, message: 'Warning created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { warning_type, issue_date, points, reason, action_plan, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (warning_type !== undefined) { updates.push(`warning_type = ?`); params.push(warning_type); }
    if (issue_date !== undefined) { updates.push(`issue_date = ?`); params.push(issue_date); }
    if (points !== undefined) { updates.push(`points = ?`); params.push(points); }
    if (reason !== undefined) { updates.push(`reason = ?`); params.push(reason); }
    if (action_plan !== undefined) { updates.push(`action_plan = ?`); params.push(action_plan); }
    if (status !== undefined) { updates.push(`status = ?`); params.push(status); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE employee_warnings SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_warning', 'employee_warnings', Number(req.params.id));
    res.json({ message: 'Warning updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const warning = await queryOne(`SELECT * FROM employee_warnings WHERE id = ?`, [req.params.id]) as any;
    if (!warning) return res.status(404).json({ error: 'Warning not found' });
    await execute(`DELETE FROM employee_warnings WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_warning', 'employee_warnings', Number(req.params.id));
    res.json({ message: 'Warning deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
