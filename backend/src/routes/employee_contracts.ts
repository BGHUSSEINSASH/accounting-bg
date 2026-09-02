import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, user_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT ec.*, u.full_name FROM employee_contracts ec JOIN users u ON ec.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ` AND ec.status = ?`; params.push(status); }
    if (user_id) { sql += ` AND ec.user_id = ?`; params.push(user_id); }
    const countRow = await queryOne(sql.replace('ec.*, u.full_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ` ORDER BY ec.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const contracts = await query(sql, params);
    res.json({ contracts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/user/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const contract = await queryOne(`SELECT ec.*, u.full_name FROM employee_contracts ec JOIN users u ON ec.user_id = u.id WHERE ec.user_id = ? AND ec.status = 'active' ORDER BY ec.created_at DESC LIMIT 1`, [req.params.userId]);
    res.json(contract || null);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const contract = await queryOne(`SELECT ec.*, u.full_name FROM employee_contracts ec JOIN users u ON ec.user_id = u.id WHERE ec.id = ?`, [req.params.id]);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, contract_type, start_date, end_date, basic_salary, housing_allowance, transportation_allowance, other_allowances, insurance_deduction, contract_file, status } = req.body;
    const otherAllowancesStr = other_allowances ? JSON.stringify(other_allowances) : null;
    const result = await execute(`INSERT INTO employee_contracts (user_id, contract_type, start_date, end_date, basic_salary, housing_allowance, transportation_allowance, other_allowances, insurance_deduction, contract_file, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, contract_type, start_date || null, end_date || null, basic_salary || 0, housing_allowance || 0, transportation_allowance || 0, otherAllowancesStr, insurance_deduction || 0, contract_file || null, status || 'active']);
    void logActivityAsync(req.user!.id, 'create_contract', 'employee_contracts', result.id as number);
    res.status(201).json({ id: result.id, message: 'Contract created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { contract_type, start_date, end_date, basic_salary, housing_allowance, transportation_allowance, other_allowances, insurance_deduction, contract_file, status, termination_date, termination_reason } = req.body;
    const otherAllowancesStr = other_allowances ? JSON.stringify(other_allowances) : undefined;
    const updates: string[] = [];
    const params: any[] = [];
    if (contract_type !== undefined) { updates.push(`contract_type = ?`); params.push(contract_type); }
    if (start_date !== undefined) { updates.push(`start_date = ?`); params.push(start_date); }
    if (end_date !== undefined) { updates.push(`end_date = ?`); params.push(end_date); }
    if (basic_salary !== undefined) { updates.push(`basic_salary = ?`); params.push(basic_salary); }
    if (housing_allowance !== undefined) { updates.push(`housing_allowance = ?`); params.push(housing_allowance); }
    if (transportation_allowance !== undefined) { updates.push(`transportation_allowance = ?`); params.push(transportation_allowance); }
    if (other_allowances !== undefined) { updates.push(`other_allowances = ?`); params.push(otherAllowancesStr); }
    if (insurance_deduction !== undefined) { updates.push(`insurance_deduction = ?`); params.push(insurance_deduction); }
    if (contract_file !== undefined) { updates.push(`contract_file = ?`); params.push(contract_file); }
    if (status !== undefined) { updates.push(`status = ?`); params.push(status); }
    if (status === 'terminated') {
      updates.push(`termination_date = ?`); params.push(termination_date || new Date().toISOString().split('T')[0]);
      updates.push(`termination_reason = ?`); params.push(termination_reason || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE employee_contracts SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_contract', 'employee_contracts', Number(req.params.id));
    res.json({ message: 'Contract updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute(`DELETE FROM employee_contracts WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_contract', 'employee_contracts', Number(req.params.id));
    res.json({ message: 'Contract deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
