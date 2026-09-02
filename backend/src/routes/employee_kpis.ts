import { Router, Response } from 'express';
import { query, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/:employeeId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const kpis = await query('SELECT * FROM employee_kpis WHERE employee_id = ? ORDER BY period_start DESC', [req.params.employeeId]);
    res.json(kpis);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, kpi_name, kpi_type, target_value, actual_value, weight, evaluation_period, period_start, period_end, notes } = req.body;
    const result = await execute(`INSERT INTO employee_kpis (employee_id, kpi_name, kpi_type, target_value, actual_value, weight, evaluation_period, period_start, period_end, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, kpi_name, kpi_type, target_value, actual_value || 0, weight, evaluation_period, period_start, period_end, notes]);
    res.json({ id: result.id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { actual_value, notes } = req.body;
    await execute('UPDATE employee_kpis SET actual_value = ?, notes = ? WHERE id = ?', [actual_value, notes, req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
