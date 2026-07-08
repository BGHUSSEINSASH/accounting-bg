import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { employee_id, from, to } = req.query;
    let query = `SELECT o.*, u.full_name as employee_name FROM overtime_records o JOIN users u ON u.id = o.employee_id WHERE 1=1`;
    const params: any[] = [];
    if (employee_id) { query += ' AND o.employee_id = ?'; params.push(employee_id); }
    if (from) { query += ' AND o.date >= ?'; params.push(from); }
    if (to) { query += ' AND o.date <= ?'; params.push(to); }
    query += ' ORDER BY o.date DESC';
    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { employee_id, date, hours, rate_multiplier, amount, notes } = req.body;
    const result = db.prepare('INSERT INTO overtime_records (employee_id, date, hours, rate_multiplier, amount, notes) VALUES (?, ?, ?, ?, ?, ?)').run(employee_id, date, hours, rate_multiplier || 1.5, amount, notes);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/approve', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE overtime_records SET approved = 1, approved_by = ?, notes = COALESCE(?, notes) WHERE id = ?').run(req.user!.id, req.body.notes, req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
