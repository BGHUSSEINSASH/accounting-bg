import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { getDatabase } from '../config/database';

const router = Router();

router.get('/', authenticate, authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id, from, to, page = 1, limit = 20 } = req.query;
    let query = `SELECT la.id, la.username, la.created_at as attempted_at, la.ip_address, u.full_name FROM login_attempts la LEFT JOIN users u ON u.username = la.username WHERE 1=1`;
    const params: any[] = [];

    if (user_id) { query += ' AND la.username = (SELECT username FROM users WHERE id = ?)'; params.push(user_id); }
    if (from) { query += ' AND la.created_at >= ?'; params.push(from); }
    if (to) { query += ' AND la.created_at <= ?'; params.push(to); }

    const total = db.prepare(query.replace('SELECT la.id, la.username, la.created_at as attempted_at, la.ip_address, u.full_name', 'SELECT COUNT(*) as total')).get(...params) as any;
    query += ' ORDER BY la.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const history = db.prepare(query).all(...params);

    res.json({ history, total: total?.total || 0, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
