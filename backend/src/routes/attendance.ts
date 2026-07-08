import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { AuthRequest } from '../types';
import { upload } from '../middleware/upload';
import { logActivity } from '../utils/helpers';
import { syncSingleFile } from '../services/cloudSync';

const router = Router();
router.use(authenticate);

// Get attendance records
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, from, to, user_id, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = `SELECT a.*, u.full_name, u.department FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND a.date >= ?'; params.push(from); }
    if (to) { query += ' AND a.date <= ?'; params.push(to); }
    if (user_id) { query += ' AND a.user_id = ?'; params.push(user_id); }
    if (status) { query += ' AND a.status = ?'; params.push(status); }
    const total = (db.prepare(query.replace('a.*, u.full_name, u.department', 'COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY a.date DESC, a.check_in_time DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const records = db.prepare(query).all(...params);
    res.json({ records, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Check in
router.post('/check-in', upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'place_photo', maxCount: 1 }
]), validate(schemas.checkInSchema), (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, notes } = req.body;
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    
    const existing = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(req.user!.id, today) as any;
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
    const shift = db.prepare(`SELECT s.* FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.user_id = ? AND sa.is_active = 1 AND (sa.end_date IS NULL OR sa.end_date >= ?) ORDER BY sa.start_date DESC LIMIT 1`).get(req.user!.id, today) as any;
    let shiftStartMinutes = 9 * 60;
    let graceMinutes = 15;
    if (shift) {
      const [sh, sm] = shift.start_time.split(':').map(Number);
      shiftStartMinutes = sh * 60 + sm;
      graceMinutes = shift.grace_minutes || 15;
    }
    const lateMinutes = currentMinutes > (shiftStartMinutes + graceMinutes) ? currentMinutes - shiftStartMinutes - graceMinutes : 0;

    if (existing) {
      db.prepare(`UPDATE attendance SET check_in_time = ?, check_in_location_lat = ?, check_in_location_lng = ?, check_in_photo = ?, check_in_place_photo = ?, status = ?, late_minutes = ?, notes = COALESCE(?, notes) WHERE id = ?`)
        .run(checkInTime, latitude || null, longitude || null, selfiePath, placePath, lateMinutes > 0 ? 'late' : 'present', lateMinutes, notes || null, existing.id);
    } else {
      db.prepare(`INSERT INTO attendance (user_id, date, check_in_time, check_in_location_lat, check_in_location_lng, check_in_photo, check_in_place_photo, status, late_minutes, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(req.user!.id, today, checkInTime, latitude || null, longitude || null, selfiePath, placePath, lateMinutes > 0 ? 'late' : 'present', lateMinutes, notes || null);
    }
      if (selfieFile) void syncSingleFile(selfieFile.path, 'uploads');
      if (placeFile) void syncSingleFile(placeFile.path, 'uploads');
    
    logActivity(req.user!.id, 'check_in', 'attendance');
    res.json({ message: 'Check-in recorded', time: checkInTime, status: lateMinutes > 0 ? 'late' : 'present', late_minutes: lateMinutes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Check out
router.post('/check-out', upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'place_photo', maxCount: 1 }
]), validate(schemas.checkOutSchema), (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    
    const record = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(req.user!.id, today) as any;
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

    // Calculate early checkout
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shift = db.prepare(`SELECT s.* FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.user_id = ? AND sa.is_active = 1 AND (sa.end_date IS NULL OR sa.end_date >= ?) ORDER BY sa.start_date DESC LIMIT 1`).get(req.user!.id, today) as any;
    let shiftEndMinutes = 18 * 60;
    let earlyMinutes = 0;
    if (shift) {
      const [eh, em] = shift.end_time.split(':').map(Number);
      shiftEndMinutes = eh * 60 + em;
    }
    earlyMinutes = currentMinutes < shiftEndMinutes ? shiftEndMinutes - currentMinutes : 0;

    db.prepare(`UPDATE attendance SET check_out_time = ?, check_out_location_lat = ?, check_out_location_lng = ?, check_out_photo = ?, check_out_place_photo = ?, work_hours = ?, early_minutes = ?, early_checkout = ? WHERE id = ?`)
      .run(checkOutTime, latitude || null, longitude || null, selfiePath, placePath, Math.round(workHours * 100) / 100, earlyMinutes, earlyMinutes > 0 ? 1 : 0, record.id);
    if (selfieFile) void syncSingleFile(selfieFile.path, 'uploads');
    if (placeFile) void syncSingleFile(placeFile.path, 'uploads');
    
    logActivity(req.user!.id, 'check_out', 'attendance');
    res.json({ message: 'Check-out recorded', time: checkOutTime, work_hours: Math.round(workHours * 100) / 100, early_minutes: earlyMinutes, early_checkout: earlyMinutes > 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Today's attendance
router.get('/today', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const records = db.prepare(`SELECT a.*, u.full_name, u.department FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.date = ? ORDER BY a.check_in_time`).all(today);
    const summary = {
      present: records.filter((r: any) => r.status === 'present').length,
      late: records.filter((r: any) => r.status === 'late').length,
      absent: records.filter((r: any) => r.status === 'absent').length,
      not_checked_in: 0
    };
    res.json({ records, summary, date: today });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// My attendance
router.get('/my', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, limit = 30 } = req.query;
    let query = 'SELECT * FROM attendance WHERE user_id = ?';
    const params: any[] = [req.user!.id];
    if (from) { query += ' AND date >= ?'; params.push(from); }
    if (to) { query += ' AND date <= ?'; params.push(to); }
    query += ' ORDER BY date DESC LIMIT ?';
    params.push(Number(limit));
    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Attendance summary
router.get('/summary', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to, user_id } = req.query;
    let query = `SELECT a.user_id, u.full_name, COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days, COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days, COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days, COALESCE(SUM(a.late_minutes), 0) as total_late_minutes, COALESCE(SUM(a.work_hours), 0) as total_work_hours FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ' AND a.date >= ?'; params.push(from); }
    if (to) { query += ' AND a.date <= ?'; params.push(to); }
    if (user_id) { query += ' AND a.user_id = ?'; params.push(user_id); }
    query += ' GROUP BY a.user_id, u.full_name ORDER BY u.full_name';
    const summary = db.prepare(query).all(...params);
    res.json(summary);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Approve attendance record
router.put('/:id/approve', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE attendance SET approved_by = ? WHERE id = ?').run(req.user!.id, req.params.id);
    logActivity(req.user!.id, 'approve_attendance', 'attendance', parseInt(req.params.id));
    res.json({ message: 'Attendance approved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


