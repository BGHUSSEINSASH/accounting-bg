import { Router, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/:clientId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lp = await queryOne('SELECT * FROM loyalty_points WHERE client_id = ?', [req.params.clientId]);
    const transactions = await query('SELECT * FROM loyalty_transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.clientId]);
    res.json({ points: lp || { points: 0, points_used: 0 }, transactions });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.post('/earn', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, points, invoice_id } = req.body;
    const existing = await queryOne('SELECT id FROM loyalty_points WHERE client_id = ?', [client_id]) as any;
    if (existing) {
      await execute('UPDATE loyalty_points SET points = points + ? WHERE client_id = ?', [points, client_id]);
    } else {
      await execute('INSERT INTO loyalty_points (client_id, points) VALUES (?, ?)', [client_id, points]);
    }
    await execute('INSERT INTO loyalty_transactions (client_id, points, type, reference_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)', [client_id, points, 'earn', 'invoice', invoice_id, 'Points earned from invoice']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.post('/redeem', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, points, invoice_id } = req.body;
    const current = await queryOne('SELECT points FROM loyalty_points WHERE client_id = ?', [client_id]) as any;
    if (!current || current.points < points) return res.status(400).json({ error: 'Insufficient points' });
    await execute('UPDATE loyalty_points SET points = points - ?, points_used = points_used + ? WHERE client_id = ?', [points, points, client_id]);
    await execute('INSERT INTO loyalty_transactions (client_id, points, type, reference_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)', [client_id, points, 'redeem', 'invoice', invoice_id, 'Points redeemed']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
