import { Router, Response } from 'express';
import { query, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, from, to } = req.query;
    let sql = `SELECT o.*, u.full_name as employee_name FROM overtime_records o JOIN users u ON u.id = o.employee_id WHERE 1=1`;
    const params: any[] = [];
    if (employee_id) { sql += ' AND o.employee_id = ?'; params.push(employee_id); }
    if (from) { sql += ' AND o.date >= ?'; params.push(from); }
    if (to) { sql += ' AND o.date <= ?'; params.push(to); }
    sql += ' ORDER BY o.date DESC';
    const records = await query(sql, params);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, date, hours, rate_multiplier, amount, notes } = req.body;
    const result = await execute('INSERT INTO overtime_records (employee_id, date, hours, rate_multiplier, amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [employee_id, date, hours, rate_multiplier || 1.5, amount, notes]);
    res.json({ id: result.id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE overtime_records SET approved = 1, approved_by = ?, notes = COALESCE(?, notes) WHERE id = ?', [req.user!.id, req.body.notes, req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
