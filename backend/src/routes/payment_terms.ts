import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const terms = await query(`SELECT pt.*, (SELECT COUNT(*) FROM payment_term_lines WHERE term_id = pt.id) as line_count FROM payment_terms pt ORDER BY pt.name`) as any[];
    for (const term of terms) {
      term.lines = await query("SELECT * FROM payment_term_lines WHERE term_id = ? ORDER BY sequence", [term.id]);
    }
    res.json(terms);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const term = await queryOne("SELECT * FROM payment_terms WHERE id = ?", [req.params.id]) as any;
    if (!term) return res.status(404).json({ error: 'Payment term not found' });
    term.lines = await query("SELECT * FROM payment_term_lines WHERE term_id = ? ORDER BY sequence", [req.params.id]);
    res.json(term);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, lines } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!lines || lines.length === 0) return res.status(400).json({ error: 'At least one line required' });
    const termId = await withTransaction(async (client) => {
      const result = await client.query("INSERT INTO payment_terms (name, description) VALUES ($1,$2) RETURNING id", [name, description || null]);
      const tid = result.rows[0].id;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await client.query("INSERT INTO payment_term_lines (term_id, sequence, type, value, days, discount_percentage, discount_days) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [tid, line.sequence || (i + 1), line.type || 'percent', line.value || 100, line.days || 0, line.discount_percentage || 0, line.discount_days || 0]);
      }
      return tid;
    });
    void logActivityAsync(req.user!.id, 'create_payment_term', 'payment_term', termId as number);
    res.json({ message: 'Payment term created', id: termId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, lines } = req.body;
    await withTransaction(async (client) => {
      await client.query("UPDATE payment_terms SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3", [name, description, req.params.id]);
      if (lines) {
        await client.query("DELETE FROM payment_term_lines WHERE term_id = $1", [req.params.id]);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          await client.query("INSERT INTO payment_term_lines (term_id, sequence, type, value, days, discount_percentage, discount_days) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [req.params.id, line.sequence || (i + 1), line.type || 'percent', line.value || 100, line.days || 0, line.discount_percentage || 0, line.discount_days || 0]);
        }
      }
    });
    void logActivityAsync(req.user!.id, 'update_payment_term', 'payment_term', parseInt(req.params.id));
    res.json({ message: 'Payment term updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute("DELETE FROM payment_term_lines WHERE term_id = ?", [req.params.id]);
    await execute("DELETE FROM payment_terms WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_payment_term', 'payment_term', parseInt(req.params.id));
    res.json({ message: 'Payment term deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
