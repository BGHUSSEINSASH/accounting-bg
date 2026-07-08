import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = 'SELECT * FROM doctors WHERE is_active = 1';
    const params: any[] = [];
    if (search) { query += ' AND (name LIKE ? OR phone LIKE ? OR specialization LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const total = (db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const doctors = db.prepare(query).all(...params);
    res.json({ doctors, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const doctors = db.prepare('SELECT id, code, name, specialization, phone, commission_percentage FROM doctors WHERE is_active = 1 ORDER BY name').all();
    res.json(doctors);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/map', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const doctors = db.prepare('SELECT id, name, specialization, latitude, longitude, clinic_name FROM doctors WHERE is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL').all();
    res.json(doctors);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let query = `SELECT d.id, d.name, d.specialization, COUNT(ds.id) as sale_count, COALESCE(SUM(ds.commission_amount), 0) as total_commission, COALESCE(SUM(si.total), 0) as total_sales
      FROM doctors d LEFT JOIN doctor_sales ds ON d.id = ds.doctor_id LEFT JOIN sales_invoices si ON ds.sales_invoice_id = si.id`;
    const params: any[] = [];
    if (from || to) { query += ' WHERE'; }
    if (from) { query += ' si.invoice_date >= ?'; params.push(from); }
    if (from && to) query += ' AND';
    if (to) { query += ' si.invoice_date <= ?'; params.push(to); }
    query += ' GROUP BY d.id, d.name, d.specialization ORDER BY total_sales DESC';
    const stats = db.prepare(query).all(...params);
    res.json(stats);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    const sales = db.prepare(`SELECT ds.*, si.invoice_number, si.invoice_date, si.total
      FROM doctor_sales ds JOIN sales_invoices si ON ds.sales_invoice_id = si.id WHERE ds.doctor_id = ? ORDER BY si.invoice_date DESC LIMIT 50`).all(req.params.id);
    res.json({ ...doctor, sales });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createDoctorSchema), (req: AuthRequest, res: Response) => {
  try {
    const { name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes } = req.body;
    const db = getDatabase();
    const code = generateCode('DOC', 'doctors');
    db.prepare(`INSERT INTO doctors (code, name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(code, name, specialization || null, phone || null, email || null, address || null, latitude || null, longitude || null, clinic_name || null, visit_fee || 0, commission_percentage || 0, notes || null);
    logActivity(req.user!.id, 'create_doctor', 'doctor');
    res.json({ message: 'Doctor created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes, is_active } = req.body;
    const db = getDatabase();
    db.prepare(`UPDATE doctors SET name = COALESCE(?, name), specialization = COALESCE(?, specialization), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), clinic_name = COALESCE(?, clinic_name), visit_fee = COALESCE(?, visit_fee), commission_percentage = COALESCE(?, commission_percentage), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes, is_active, req.params.id);
    logActivity(req.user!.id, 'update_doctor', 'doctor', parseInt(req.params.id));
    res.json({ message: 'Doctor updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE doctors SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'delete_doctor', 'doctor', parseInt(req.params.id));
    res.json({ message: 'Doctor deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


