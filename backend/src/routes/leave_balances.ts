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
    const { page = 1, limit = 20, user_id } = req.query;
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT lb.*, u.full_name FROM leave_balances lb JOIN users u ON lb.user_id = u.id WHERE lb.year = ?`;
    const params: any[] = [year];
    if (user_id) { query += ` AND lb.user_id = ?`; params.push(user_id); }
    const total = (db.prepare(query.replace('lb.*, u.full_name', 'COUNT(*) as total')).get(...params) as any).total;
    query += ` ORDER BY u.full_name, lb.leave_type LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const balances = db.prepare(query).all(...params);
    res.json({ balances, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { user_id, leave_type, total_days, year } = req.body;
    const y = year || new Date().getFullYear();
    const db = getDatabase();
    const existing = db.prepare(`SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = ? AND year = ?`).get(user_id, leave_type, y) as any;
    if (existing) {
      db.prepare(`UPDATE leave_balances SET total_days = ?, remaining_days = ? - used_days WHERE id = ?`).run(total_days, total_days, existing.id);
      logActivity(req.user!.id, 'update_balance', 'leave_balances', existing.id);
      return res.json({ id: existing.id, message: 'Leave balance updated' });
    }
    const remaining = total_days - 0;
    const result = db.prepare(
      `INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(user_id, leave_type, total_days, 0, remaining, y);
    logActivity(req.user!.id, 'create_balance', 'leave_balances', result.lastInsertRowid as number);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Leave balance created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { total_days, used_days } = req.body;
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];
    if (total_days !== undefined) { updates.push(`total_days = ?`); params.push(total_days); }
    if (used_days !== undefined) { updates.push(`used_days = ?`); params.push(used_days); }
    if (total_days !== undefined || used_days !== undefined) {
      const current = db.prepare(`SELECT * FROM leave_balances WHERE id = ?`).get(req.params.id) as any;
      if (!current) return res.status(404).json({ error: 'Balance not found' });
      const newTotal = total_days !== undefined ? total_days : current.total_days;
      const newUsed = used_days !== undefined ? used_days : current.used_days;
      updates.push(`remaining_days = ?`);
      params.push(newTotal - newUsed);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.prepare(`UPDATE leave_balances SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logActivity(req.user!.id, 'update_balance', 'leave_balances', Number(req.params.id));
    res.json({ message: 'Leave balance updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/user/:userId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const balances = db.prepare(`SELECT lb.*, u.full_name FROM leave_balances lb JOIN users u ON lb.user_id = u.id WHERE lb.user_id = ? AND lb.year = ? ORDER BY lb.leave_type`).all(req.params.userId, year);
    res.json(balances);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/user/:userId/initialize', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const existing = db.prepare(`SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = 'annual' AND year = ?`).get(req.params.userId, year) as any;
    if (existing) {
      return res.status(400).json({ error: 'Annual leave already initialized for this year' });
    }
    const result = db.prepare(
      `INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.params.userId, 'annual', 21, 0, 21, year);
    logActivity(req.user!.id, 'initialize_annual_leave', 'leave_balances', result.lastInsertRowid as number);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Annual leave initialized with 21 days' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
