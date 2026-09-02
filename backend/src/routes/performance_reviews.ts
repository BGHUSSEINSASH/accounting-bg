import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, employee_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT pr.*, e.full_name as employee_name, r.full_name as reviewer_name, ap.full_name as approved_by_name FROM performance_reviews pr JOIN users e ON pr.employee_id = e.id JOIN users r ON pr.reviewer_id = r.id LEFT JOIN users ap ON pr.approved_by = ap.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ` AND pr.status = ?`; params.push(status); }
    if (employee_id) { sql += ` AND pr.employee_id = ?`; params.push(employee_id); }
    const countRow = await queryOne(sql.replace('pr.*, e.full_name as employee_name, r.full_name as reviewer_name, ap.full_name as approved_by_name', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ` ORDER BY pr.review_date DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const reviews = await query(sql, params);
    res.json({ reviews, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/employee/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const reviews = await query(`SELECT pr.*, e.full_name as employee_name, r.full_name as reviewer_name, ap.full_name as approved_by_name FROM performance_reviews pr JOIN users e ON pr.employee_id = e.id JOIN users r ON pr.reviewer_id = r.id LEFT JOIN users ap ON pr.approved_by = ap.id WHERE pr.employee_id = ? ORDER BY pr.review_date DESC`, [req.params.employeeId]);
    res.json(reviews);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const review = await queryOne(`SELECT pr.*, e.full_name as employee_name, r.full_name as reviewer_name, ap.full_name as approved_by_name FROM performance_reviews pr JOIN users e ON pr.employee_id = e.id JOIN users r ON pr.reviewer_id = r.id LEFT JOIN users ap ON pr.approved_by = ap.id WHERE pr.id = ?`, [req.params.id]);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, reviewer_id, review_date, overall_score, strengths, improvements, goals, achievements, status } = req.body;
    if (!employee_id || !reviewer_id || !review_date) return res.status(400).json({ error: 'employee_id, reviewer_id, and review_date are required' });
    const result = await execute(`INSERT INTO performance_reviews (employee_id, reviewer_id, review_date, overall_score, strengths, improvements, goals, achievements, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, reviewer_id, review_date, overall_score || null, strengths || null, improvements || null, goals || null, achievements || null, status || 'draft']);
    void logActivityAsync(req.user!.id, 'create_review', 'performance_reviews', result.id as number);
    res.status(201).json({ id: result.id, message: 'Review created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { overall_score, strengths, improvements, goals, achievements, review_date, reviewer_id, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (overall_score !== undefined) { updates.push(`overall_score = ?`); params.push(overall_score); }
    if (strengths !== undefined) { updates.push(`strengths = ?`); params.push(strengths); }
    if (improvements !== undefined) { updates.push(`improvements = ?`); params.push(improvements); }
    if (goals !== undefined) { updates.push(`goals = ?`); params.push(goals); }
    if (achievements !== undefined) { updates.push(`achievements = ?`); params.push(achievements); }
    if (review_date !== undefined) { updates.push(`review_date = ?`); params.push(review_date); }
    if (reviewer_id !== undefined) { updates.push(`reviewer_id = ?`); params.push(reviewer_id); }
    if (status !== undefined) { updates.push(`status = ?`); params.push(status); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE performance_reviews SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_review', 'performance_reviews', Number(req.params.id));
    res.json({ message: 'Review updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/submit', async (req: AuthRequest, res: Response) => {
  try {
    const review = await queryOne(`SELECT * FROM performance_reviews WHERE id = ?`, [req.params.id]) as any;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.status === 'approved') return res.status(400).json({ error: 'Approved reviews cannot be re-submitted' });
    await execute(`UPDATE performance_reviews SET status = 'submitted' WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'submit_review', 'performance_reviews', Number(req.params.id));
    res.json({ message: 'Review submitted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const review = await queryOne(`SELECT * FROM performance_reviews WHERE id = ?`, [req.params.id]) as any;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await execute(`UPDATE performance_reviews SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`, [req.user!.id, req.params.id]);
    void logActivityAsync(req.user!.id, 'approve_review', 'performance_reviews', Number(req.params.id));
    res.json({ message: 'Review approved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const review = await queryOne(`SELECT * FROM performance_reviews WHERE id = ?`, [req.params.id]) as any;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.status === 'approved') return res.status(400).json({ error: 'Cannot delete an approved review' });
    await execute(`DELETE FROM performance_reviews WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_review', 'performance_reviews', Number(req.params.id));
    res.json({ message: 'Review deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
