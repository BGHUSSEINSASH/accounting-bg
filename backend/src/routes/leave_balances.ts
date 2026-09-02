import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, user_id } = req.query;
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT lb.*, u.full_name FROM leave_balances lb JOIN users u ON lb.user_id = u.id WHERE lb.year = ?`;
    const params: any[] = [year];
    if (user_id) { sql += ` AND lb.user_id = ?`; params.push(user_id); }
    const countRow = await queryOne(sql.replace('lb.*, u.full_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ` ORDER BY u.full_name, lb.leave_type LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const balances = await query(sql, params);
    res.json({ balances, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/user/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const balances = await query(`SELECT lb.*, u.full_name FROM leave_balances lb JOIN users u ON lb.user_id = u.id WHERE lb.user_id = ? AND lb.year = ? ORDER BY lb.leave_type`, [req.params.userId, year]);
    res.json(balances);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, leave_type, total_days, year } = req.body;
    const y = year || new Date().getFullYear();
    const existing = await queryOne(`SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = ? AND year = ?`, [user_id, leave_type, y]) as any;
    if (existing) {
      await execute(`UPDATE leave_balances SET total_days = ?, remaining_days = ? - used_days WHERE id = ?`, [total_days, total_days, existing.id]);
      void logActivityAsync(req.user!.id, 'update_balance', 'leave_balances', existing.id);
      return res.json({ id: existing.id, message: 'Leave balance updated' });
    }
    const result = await execute(`INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, leave_type, total_days, 0, total_days, y]);
    void logActivityAsync(req.user!.id, 'create_balance', 'leave_balances', result.id as number);
    res.status(201).json({ id: result.id, message: 'Leave balance created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { total_days, used_days } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (total_days !== undefined) { updates.push(`total_days = ?`); params.push(total_days); }
    if (used_days !== undefined) { updates.push(`used_days = ?`); params.push(used_days); }
    if (total_days !== undefined || used_days !== undefined) {
      const current = await queryOne(`SELECT * FROM leave_balances WHERE id = ?`, [req.params.id]) as any;
      if (!current) return res.status(404).json({ error: 'Balance not found' });
      const newTotal = total_days !== undefined ? total_days : current.total_days;
      const newUsed = used_days !== undefined ? used_days : current.used_days;
      updates.push(`remaining_days = ?`);
      params.push(newTotal - newUsed);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE leave_balances SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_balance', 'leave_balances', Number(req.params.id));
    res.json({ message: 'Leave balance updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/user/:userId/initialize', async (req: AuthRequest, res: Response) => {
  try {
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const existing = await queryOne(`SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = 'annual' AND year = ?`, [req.params.userId, year]) as any;
    if (existing) return res.status(400).json({ error: 'Annual leave already initialized for this year' });
    const result = await execute(`INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.userId, 'annual', 21, 0, 21, year]);
    void logActivityAsync(req.user!.id, 'initialize_annual_leave', 'leave_balances', result.id as number);
    res.status(201).json({ id: result.id, message: 'Annual leave initialized with 21 days' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
