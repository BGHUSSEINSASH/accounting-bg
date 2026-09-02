import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM shifts WHERE is_active = 1") as any;
    const total = countRow?.total ?? 0;
    const shifts = await query(`SELECT * FROM shifts WHERE is_active = 1 ORDER BY name LIMIT ? OFFSET ?`, [Number(limit), offset]);
    res.json({ shifts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, start_time, end_time, grace_minutes } = req.body;
    const result = await execute(`INSERT INTO shifts (name, start_time, end_time, grace_minutes) VALUES (?, ?, ?, ?)`, [name, start_time, end_time, grace_minutes ?? 15]);
    void logActivityAsync(req.user!.id, 'create_shift', 'shifts', result.id as number);
    res.status(201).json({ id: result.id, message: 'Shift created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, start_time, end_time, grace_minutes, is_active } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { updates.push(`name = ?`); params.push(name); }
    if (start_time !== undefined) { updates.push(`start_time = ?`); params.push(start_time); }
    if (end_time !== undefined) { updates.push(`end_time = ?`); params.push(end_time); }
    if (grace_minutes !== undefined) { updates.push(`grace_minutes = ?`); params.push(grace_minutes); }
    if (is_active !== undefined) { updates.push(`is_active = ?`); params.push(is_active); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE shifts SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_shift', 'shifts', Number(req.params.id));
    res.json({ message: 'Shift updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute(`UPDATE shifts SET is_active = 0 WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_shift', 'shifts', Number(req.params.id));
    res.json({ message: 'Shift deactivated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.query;
    let sql = `SELECT sa.*, u.full_name, s.name as shift_name FROM shift_assignments sa JOIN users u ON sa.user_id = u.id JOIN shifts s ON sa.shift_id = s.id WHERE 1=1`;
    const params: any[] = [];
    if (user_id) { sql += ` AND sa.user_id = ?`; params.push(user_id); }
    sql += ` ORDER BY sa.start_date DESC`;
    const assignments = await query(sql, params);
    res.json(assignments);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, shift_id, start_date, end_date } = req.body;
    const result = await execute(`INSERT INTO shift_assignments (user_id, shift_id, start_date, end_date) VALUES (?, ?, ?, ?)`, [user_id, shift_id, start_date || null, end_date || null]);
    void logActivityAsync(req.user!.id, 'assign_shift', 'shift_assignments', result.id as number);
    res.status(201).json({ id: result.id, message: 'Shift assigned' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/assignments/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { shift_id, start_date, end_date, is_active } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (shift_id !== undefined) { updates.push(`shift_id = ?`); params.push(shift_id); }
    if (start_date !== undefined) { updates.push(`start_date = ?`); params.push(start_date); }
    if (end_date !== undefined) { updates.push(`end_date = ?`); params.push(end_date); }
    if (is_active !== undefined) { updates.push(`is_active = ?`); params.push(is_active); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE shift_assignments SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_assignment', 'shift_assignments', Number(req.params.id));
    res.json({ message: 'Assignment updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/assignments/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute(`UPDATE shift_assignments SET is_active = 0 WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'deactivate_assignment', 'shift_assignments', Number(req.params.id));
    res.json({ message: 'Assignment deactivated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
