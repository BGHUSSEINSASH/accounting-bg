import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { AuthRequest } from '../types';
import { upload } from '../middleware/upload';
import { syncSingleFile } from '../services/cloudSync';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from, to, user_id, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = `SELECT a.*, u.full_name, u.department FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND a.date >= ?'; params.push(from); }
    if (to) { sql += ' AND a.date <= ?'; params.push(to); }
    if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    const countRow = await queryOne(sql.replace('a.*, u.full_name, u.department', 'COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY a.date DESC, a.check_in_time DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const records = await query(sql, params);
    res.json({ records, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/check-in', upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'place_photo', maxCount: 1 }
]), validate(schemas.checkInSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const existing = await queryOne('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user!.id, today]) as any;
    if (existing && existing.check_in_time) {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    const selfieFile = (req.files as any)?.['selfie']?.[0];
    const placeFile = (req.files as any)?.['place_photo']?.[0];
    const selfiePath = selfieFile ? `/uploads/${selfieFile.filename}` : null;
    const placePath = placeFile ? `/uploads/${placeFile.filename}` : null;
    const now = new Date();
    const checkInTime = now.toISOString();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shift = await queryOne(`SELECT s.* FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.user_id = ? AND sa.is_active = 1 AND (sa.end_date IS NULL OR sa.end_date >= ?) ORDER BY sa.start_date DESC LIMIT 1`, [req.user!.id, today]) as any;
    let shiftStartMinutes = 9 * 60;
    let graceMinutes = 15;
    if (shift) {
      const [sh, sm] = shift.start_time.split(':').map(Number);
      shiftStartMinutes = sh * 60 + sm;
      graceMinutes = shift.grace_minutes || 15;
    }
    const lateMinutes = currentMinutes > (shiftStartMinutes + graceMinutes) ? currentMinutes - shiftStartMinutes - graceMinutes : 0;
    if (existing) {
      await execute(`UPDATE attendance SET check_in_time = ?, check_in_location_lat = ?, check_in_location_lng = ?, check_in_photo = ?, check_in_place_photo = ?, status = ?, late_minutes = ?, notes = COALESCE(?, notes) WHERE id = ?`,
        [checkInTime, latitude || null, longitude || null, selfiePath, placePath, lateMinutes > 0 ? 'late' : 'present', lateMinutes, notes || null, existing.id]);
    } else {
      await execute(`INSERT INTO attendance (user_id, date, check_in_time, check_in_location_lat, check_in_location_lng, check_in_photo, check_in_place_photo, status, late_minutes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user!.id, today, checkInTime, latitude || null, longitude || null, selfiePath, placePath, lateMinutes > 0 ? 'late' : 'present', lateMinutes, notes || null]);
    }
    if (selfieFile) void syncSingleFile(selfieFile.path, 'uploads');
    if (placeFile) void syncSingleFile(placeFile.path, 'uploads');
    void logActivityAsync(req.user!.id, 'check_in', 'attendance');
    res.json({ message: 'Check-in recorded', time: checkInTime, status: lateMinutes > 0 ? 'late' : 'present', late_minutes: lateMinutes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/check-out', upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'place_photo', maxCount: 1 }
]), validate(schemas.checkOutSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const record = await queryOne('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user!.id, today]) as any;
    if (!record || !record.check_in_time) {
      return res.status(400).json({ error: 'No check-in record found for today' });
    }
    if (record.check_out_time) {
      return res.status(400).json({ error: 'Already checked out today' });
    }
    const selfieFile = (req.files as any)?.['selfie']?.[0];
    const placeFile = (req.files as any)?.['place_photo']?.[0];
    const selfiePath = selfieFile ? `/uploads/${selfieFile.filename}` : null;
    const placePath = placeFile ? `/uploads/${placeFile.filename}` : null;
    const checkOutTime = new Date().toISOString();
    const checkIn = new Date(record.check_in_time).getTime();
    const checkOut = new Date(checkOutTime).getTime();
    const workHours = (checkOut - checkIn) / (1000 * 60 * 60);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shift = await queryOne(`SELECT s.* FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.user_id = ? AND sa.is_active = 1 AND (sa.end_date IS NULL OR sa.end_date >= ?) ORDER BY sa.start_date DESC LIMIT 1`, [req.user!.id, today]) as any;
    let shiftEndMinutes = 18 * 60;
    if (shift) {
      const [eh, em] = shift.end_time.split(':').map(Number);
      shiftEndMinutes = eh * 60 + em;
    }
    const earlyMinutes = currentMinutes < shiftEndMinutes ? shiftEndMinutes - currentMinutes : 0;
    await execute(`UPDATE attendance SET check_out_time = ?, check_out_location_lat = ?, check_out_location_lng = ?, check_out_photo = ?, check_out_place_photo = ?, work_hours = ?, early_minutes = ?, early_checkout = ? WHERE id = ?`,
      [checkOutTime, latitude || null, longitude || null, selfiePath, placePath, Math.round(workHours * 100) / 100, earlyMinutes, earlyMinutes > 0 ? 1 : 0, record.id]);
    if (selfieFile) void syncSingleFile(selfieFile.path, 'uploads');
    if (placeFile) void syncSingleFile(placeFile.path, 'uploads');
    void logActivityAsync(req.user!.id, 'check_out', 'attendance');
    res.json({ message: 'Check-out recorded', time: checkOutTime, work_hours: Math.round(workHours * 100) / 100, early_minutes: earlyMinutes, early_checkout: earlyMinutes > 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/today', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const records = await query(`SELECT a.*, u.full_name, u.department FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.date = ? ORDER BY a.check_in_time`, [today]);
    const summary = {
      present: records.filter((r: any) => r.status === 'present').length,
      late: records.filter((r: any) => r.status === 'late').length,
      absent: records.filter((r: any) => r.status === 'absent').length,
      not_checked_in: 0
    };
    res.json({ records, summary, date: today });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/my', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, limit = 30 } = req.query;
    let sql = 'SELECT * FROM attendance WHERE user_id = ?';
    const params: any[] = [req.user!.id];
    if (from) { sql += ' AND date >= ?'; params.push(from); }
    if (to) { sql += ' AND date <= ?'; params.push(to); }
    sql += ' ORDER BY date DESC LIMIT ?';
    params.push(Number(limit));
    const records = await query(sql, params);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, user_id } = req.query;
    let sql = `SELECT a.user_id, u.full_name, COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days, COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days, COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days, COALESCE(SUM(a.late_minutes), 0) as total_late_minutes, COALESCE(SUM(a.work_hours), 0) as total_work_hours FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { sql += ' AND a.date >= ?'; params.push(from); }
    if (to) { sql += ' AND a.date <= ?'; params.push(to); }
    if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id); }
    sql += ' GROUP BY a.user_id, u.full_name ORDER BY u.full_name';
    const summary = await query(sql, params);
    res.json(summary);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE attendance SET approved_by = ? WHERE id = ?', [req.user!.id, req.params.id]);
    void logActivityAsync(req.user!.id, 'approve_attendance', 'attendance', parseInt(req.params.id));
    res.json({ message: 'Attendance approved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
