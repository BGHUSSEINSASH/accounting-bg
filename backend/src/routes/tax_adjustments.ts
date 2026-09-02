import { Router, Response } from 'express';
import { query, queryOne, execute, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM tax_adjustments") as any;
    const total = countRow?.total ?? 0;
    const adjustments = await query("SELECT ta.*, a.code as tax_account_code, a.name as tax_account_name FROM tax_adjustments ta LEFT JOIN accounts a ON ta.tax_account_id = a.id ORDER BY ta.date DESC LIMIT ? OFFSET ?", [Number(limit), offset]);
    res.json({ adjustments, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const adj = await queryOne("SELECT ta.*, a.code as tax_account_code, a.name as tax_account_name FROM tax_adjustments ta LEFT JOIN accounts a ON ta.tax_account_id = a.id WHERE ta.id = ?", [req.params.id]) as any;
    if (!adj) return res.status(404).json({ error: 'Tax adjustment not found' });
    res.json(adj);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { date, type, amount, tax_account_id, base_account_id, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    const adjNumber = await generateCodeAsync('TA', 'tax_adjustments', 'adjustment_number');
    const result = await execute("INSERT INTO tax_adjustments (adjustment_number, date, type, amount, tax_account_id, base_account_id, reason, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)",
      [adjNumber, date || new Date().toISOString().split('T')[0], type || 'addition', amount, tax_account_id || null, base_account_id || null, reason || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_tax_adjustment', 'tax_adjustment', result.id as number);
    res.json({ message: 'Tax adjustment created', id: result.id, adjustment_number: adjNumber });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const adj = await queryOne("SELECT * FROM tax_adjustments WHERE id = ?", [req.params.id]) as any;
    if (!adj) return res.status(404).json({ error: 'Tax adjustment not found' });
    if (adj.status !== 'draft') return res.status(400).json({ error: 'Only draft adjustments can be posted' });
    await execute("UPDATE tax_adjustments SET status = 'posted' WHERE id = ?", [adj.id]);
    void logActivityAsync(req.user!.id, 'post_tax_adjustment', 'tax_adjustment', parseInt(req.params.id));
    res.json({ message: 'Tax adjustment posted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/cancel', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const adj = await queryOne("SELECT * FROM tax_adjustments WHERE id = ?", [req.params.id]) as any;
    if (!adj) return res.status(404).json({ error: 'Tax adjustment not found' });
    await execute("UPDATE tax_adjustments SET status = 'cancelled' WHERE id = ?", [adj.id]);
    void logActivityAsync(req.user!.id, 'cancel_tax_adjustment', 'tax_adjustment', parseInt(req.params.id));
    res.json({ message: 'Tax adjustment cancelled' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
