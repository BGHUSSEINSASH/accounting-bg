import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM shifts WHERE is_active = 1").get() as any).total;
    const shifts = db.prepare(`SELECT * FROM shifts WHERE is_active = 1 ORDER BY name LIMIT ? OFFSET ?`).all(Number(limit), offset);
    res.json({ shifts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, start_time, end_time, grace_minutes } = req.body;
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO shifts (name, start_time, end_time, grace_minutes) VALUES (?, ?, ?, ?)`
    ).run(name, start_time, end_time, grace_minutes ?? 15);
    logActivity(req.user!.id, 'create_shift', 'shifts', result.lastInsertRowid as number);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Shift created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, start_time, end_time, grace_minutes, is_active } = req.body;
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { updates.push(`name = ?`); params.push(name); }
    if (start_time !== undefined) { updates.push(`start_time = ?`); params.push(start_time); }
    if (end_time !== undefined) { updates.push(`end_time = ?`); params.push(end_time); }
    if (grace_minutes !== undefined) { updates.push(`grace_minutes = ?`); params.push(grace_minutes); }
    if (is_active !== undefined) { updates.push(`is_active = ?`); params.push(is_active); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.prepare(`UPDATE shifts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logActivity(req.user!.id, 'update_shift', 'shifts', Number(req.params.id));
    res.json({ message: 'Shift updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`UPDATE shifts SET is_active = 0 WHERE id = ?`).run(req.params.id);
    logActivity(req.user!.id, 'delete_shift', 'shifts', Number(req.params.id));
    res.json({ message: 'Shift deactivated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/assignments', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id } = req.query;
    let query = `SELECT sa.*, u.full_name, s.name as shift_name FROM shift_assignments sa JOIN users u ON sa.user_id = u.id JOIN shifts s ON sa.shift_id = s.id WHERE 1=1`;
    const params: any[] = [];
    if (user_id) { query += ` AND sa.user_id = ?`; params.push(user_id); }
    query += ` ORDER BY sa.start_date DESC`;
    const assignments = db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/assignments', (req: AuthRequest, res: Response) => {
  try {
    const { user_id, shift_id, start_date, end_date } = req.body;
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO shift_assignments (user_id, shift_id, start_date, end_date) VALUES (?, ?, ?, ?)`
    ).run(user_id, shift_id, start_date || null, end_date || null);
    logActivity(req.user!.id, 'assign_shift', 'shift_assignments', result.lastInsertRowid as number);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Shift assigned' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/assignments/:id', (req: AuthRequest, res: Response) => {
  try {
    const { shift_id, start_date, end_date, is_active } = req.body;
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];
    if (shift_id !== undefined) { updates.push(`shift_id = ?`); params.push(shift_id); }
    if (start_date !== undefined) { updates.push(`start_date = ?`); params.push(start_date); }
    if (end_date !== undefined) { updates.push(`end_date = ?`); params.push(end_date); }
    if (is_active !== undefined) { updates.push(`is_active = ?`); params.push(is_active); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.prepare(`UPDATE shift_assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logActivity(req.user!.id, 'update_assignment', 'shift_assignments', Number(req.params.id));
    res.json({ message: 'Assignment updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/assignments/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`UPDATE shift_assignments SET is_active = 0 WHERE id = ?`).run(req.params.id);
    logActivity(req.user!.id, 'deactivate_assignment', 'shift_assignments', Number(req.params.id));
    res.json({ message: 'Assignment deactivated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
