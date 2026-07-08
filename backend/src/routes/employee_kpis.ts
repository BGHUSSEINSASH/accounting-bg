import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/:employeeId', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const kpis = db.prepare('SELECT * FROM employee_kpis WHERE employee_id = ? ORDER BY period_start DESC').all(req.params.employeeId);
    res.json(kpis);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { employee_id, kpi_name, kpi_type, target_value, actual_value, weight, evaluation_period, period_start, period_end, notes } = req.body;
    const result = db.prepare(`INSERT INTO employee_kpis (employee_id, kpi_name, kpi_type, target_value, actual_value, weight, evaluation_period, period_start, period_end, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(employee_id, kpi_name, kpi_type, target_value, actual_value || 0, weight, evaluation_period, period_start, period_end, notes);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { actual_value, notes } = req.body;
    db.prepare('UPDATE employee_kpis SET actual_value = ?, notes = ? WHERE id = ?').run(actual_value, notes, req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
