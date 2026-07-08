import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const records = db.prepare(`
      SELECT a.id, a.user_id, u.full_name, u.department, u.phone,
        a.check_in_time, a.check_out_time, a.check_in_location_lat, a.check_in_location_lng,
        a.check_out_location_lat, a.check_out_location_lng, a.status, a.late_minutes, a.early_minutes,
        a.work_hours, a.check_in_photo, a.check_out_photo, a.early_checkout
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ?
      ORDER BY u.full_name
    `).all(today);

    const withMapUrl = records.map((r: any) => ({
      ...r,
      check_in_map_url: r.check_in_location_lat ? `https://www.google.com/maps?q=${r.check_in_location_lat},${r.check_in_location_lng}` : null,
      check_out_map_url: r.check_out_location_lat ? `https://www.google.com/maps?q=${r.check_out_location_lat},${r.check_out_location_lng}` : null,
    }));

    res.json({ records: withMapUrl, date: today });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:userId', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, limit = 30 } = req.query;
    let query = `
      SELECT a.*, u.full_name, u.department, u.phone,
        s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN shift_assignments sa ON sa.user_id = a.user_id AND sa.is_active = 1
      LEFT JOIN shifts s ON s.id = sa.shift_id
      WHERE a.user_id = ?
    `;
    const params: any[] = [req.params.userId];
    if (from) { query += ' AND a.date >= ?'; params.push(from); }
    if (to) { query += ' AND a.date <= ?'; params.push(to); }
    query += ' ORDER BY a.date DESC LIMIT ?';
    params.push(Number(limit));
    const records = db.prepare(query).all(...params) as any[];

    const user = db.prepare('SELECT id, full_name, department, phone, email, profile_image FROM users WHERE id = ?').get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_days,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
        COALESCE(SUM(a.late_minutes), 0) as total_late_minutes,
        COALESCE(SUM(a.early_minutes), 0) as total_early_minutes,
        COALESCE(SUM(a.work_hours), 0) as total_work_hours
      FROM attendance a WHERE a.user_id = ?
    `).get(req.params.userId) as any;

    const withMapUrl = records.map((r: any) => ({
      ...r,
      check_in_map_url: r.check_in_location_lat ? `https://www.google.com/maps?q=${r.check_in_location_lat},${r.check_in_location_lng}` : null,
      check_out_map_url: r.check_out_location_lat ? `https://www.google.com/maps?q=${r.check_out_location_lat},${r.check_out_location_lng}` : null,
    }));

    res.json({ user, records: withMapUrl, summary });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
