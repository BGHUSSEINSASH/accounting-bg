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
    let sql = `SELECT el.*, u.full_name FROM employee_loans el JOIN users u ON el.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ` AND el.status = ?`; params.push(status); }
    if (user_id) { sql += ` AND el.user_id = ?`; params.push(user_id); }
    const countRow = await queryOne(sql.replace('el.*, u.full_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const loans = await query(sql, params);
    res.json({ loans, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/user/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const loans = await query(`SELECT el.*, u.full_name FROM employee_loans el JOIN users u ON el.user_id = u.id WHERE el.user_id = ? ORDER BY el.created_at DESC`, [req.params.userId]);
    res.json(loans);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const loan = await queryOne(`SELECT el.*, u.full_name FROM employee_loans el JOIN users u ON el.user_id = u.id WHERE el.id = ?`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    res.json(loan);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, total_amount, monthly_deduction, start_month, reason } = req.body;
    if (!user_id || !total_amount || !monthly_deduction || monthly_deduction <= 0) return res.status(400).json({ error: 'user_id, total_amount, and monthly_deduction (positive) are required' });
    const months = Math.ceil(total_amount / monthly_deduction);
    const startYear = parseInt(start_month.slice(0, 4));
    const startMonth = parseInt(start_month.slice(5, 7));
    const endMonthNum = startMonth + months - 1;
    const endYear = startYear + Math.floor((endMonthNum - 1) / 12);
    const endMonth = ((endMonthNum - 1) % 12) + 1;
    const endMonthFormatted = `${endYear}-${String(endMonth).padStart(2, '0')}`;
    const result = await execute(`INSERT INTO employee_loans (user_id, amount, total_amount, remaining_amount, monthly_deduction, start_month, end_month, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, total_amount, total_amount, total_amount, monthly_deduction, start_month, endMonthFormatted, reason || null]);
    void logActivityAsync(req.user!.id, 'create_loan', 'employee_loans', result.id as number);
    res.status(201).json({ id: result.id, message: 'Loan created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { total_amount, monthly_deduction, remaining_amount, status, approved_by, reason } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (total_amount !== undefined) { updates.push(`total_amount = ?`); params.push(total_amount); }
    if (monthly_deduction !== undefined) { updates.push(`monthly_deduction = ?`); params.push(monthly_deduction); }
    if (remaining_amount !== undefined) { updates.push(`remaining_amount = ?`); params.push(remaining_amount); }
    if (status !== undefined) { updates.push(`status = ?`); params.push(status); }
    if (approved_by !== undefined) { updates.push(`approved_by = ?`); params.push(approved_by); }
    if (reason !== undefined) { updates.push(`reason = ?`); params.push(reason); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE employee_loans SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_loan', 'employee_loans', Number(req.params.id));
    res.json({ message: 'Loan updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const loan = await queryOne(`SELECT * FROM employee_loans WHERE id = ?`, [req.params.id]) as any;
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status === 'active') return res.status(400).json({ error: 'Cannot delete an active loan. Cancel it first.' });
    await execute(`DELETE FROM employee_loans WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_loan', 'employee_loans', Number(req.params.id));
    res.json({ message: 'Loan deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
