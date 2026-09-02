import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query, queryOne } from '../config/database';

const router = Router();

router.get('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, from, to, page = 1, limit = 20 } = req.query;
    let sql = `SELECT la.id, la.username, la.created_at as attempted_at, la.ip_address, u.full_name FROM login_attempts la LEFT JOIN users u ON u.username = la.username WHERE 1=1`;
    const params: any[] = [];
    if (user_id) { sql += ' AND la.username = (SELECT username FROM users WHERE id = ?)'; params.push(user_id); }
    if (from) { sql += ' AND la.created_at >= ?'; params.push(from); }
    if (to) { sql += ' AND la.created_at <= ?'; params.push(to); }
    const countRow = await queryOne(sql.replace('SELECT la.id, la.username, la.created_at as attempted_at, la.ip_address, u.full_name', 'SELECT COUNT(*) as total'), params) as any;
    sql += ' ORDER BY la.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const history = await query(sql, params);
    res.json({ history, total: countRow?.total || 0, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
