import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

router.get('/:clientId', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const lp = db.prepare('SELECT * FROM loyalty_points WHERE client_id = ?').get(req.params.clientId);
    const transactions = db.prepare('SELECT * FROM loyalty_transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.clientId);
    res.json({ points: lp || { points: 0, points_used: 0 }, transactions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/earn', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { client_id, points, invoice_id } = req.body;
    const existing = db.prepare('SELECT id FROM loyalty_points WHERE client_id = ?').get(client_id) as any;
    if (existing) {
      db.prepare('UPDATE loyalty_points SET points = points + ? WHERE client_id = ?').run(points, client_id);
    } else {
      db.prepare('INSERT INTO loyalty_points (client_id, points) VALUES (?, ?)').run(client_id, points);
    }
    db.prepare('INSERT INTO loyalty_transactions (client_id, points, type, reference_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)').run(client_id, points, 'earn', 'invoice', invoice_id, 'Points earned from invoice');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/redeem', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { client_id, points, invoice_id } = req.body;
    const current = db.prepare('SELECT points FROM loyalty_points WHERE client_id = ?').get(client_id) as any;
    if (!current || current.points < points) return res.status(400).json({ error: 'Insufficient points' });
    db.prepare('UPDATE loyalty_points SET points = points - ?, points_used = points_used + ? WHERE client_id = ?').run(points, points, client_id);
    db.prepare('INSERT INTO loyalty_transactions (client_id, points, type, reference_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)').run(client_id, points, 'redeem', 'invoice', invoice_id, 'Points redeemed');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
