import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM leaves").get() as any).total;
    const leaves = db.prepare(`
      SELECT l.*, u.full_name FROM leaves l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(Number(limit), offset);
    res.json({ leaves, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    const db = getDatabase();
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: "Invalid date format" });
    if (end < start) return res.status(400).json({ error: "End date must be after start date" });
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const result = db.prepare(
      'INSERT INTO leaves (user_id, leave_type, start_date, end_date, days_count, reason) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user!.id, leave_type, start_date, end_date, days, reason);
    logActivity(req.user!.id, 'submit_leave', 'leave', result.lastInsertRowid as number);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Leave request submitted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const db = getDatabase();
    db.prepare('UPDATE leaves SET status = ?, approved_by = ? WHERE id = ?').run(status, req.user!.id, req.params.id);
    logActivity(req.user!.id, status === 'approved' ? 'approve_leave' : 'reject_leave', 'leave', parseInt(req.params.id));
    res.json({ message: 'Leave updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
