import { Router, Response } from 'express';
import { query, queryOne, execute, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = 'SELECT * FROM doctors WHERE is_active = 1';
    const params: any[] = [];
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR specialization LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const countRow = await queryOne(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params) as any;
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const doctors = await query(sql, params);
    res.json({ doctors, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', async (_req: AuthRequest, res: Response) => {
  try {
    const doctors = await query('SELECT id, code, name, specialization, phone, commission_percentage FROM doctors WHERE is_active = 1 ORDER BY name');
    res.json(doctors);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/map', async (_req: AuthRequest, res: Response) => {
  try {
    const doctors = await query('SELECT id, name, specialization, latitude, longitude, clinic_name FROM doctors WHERE is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL');
    res.json(doctors);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT d.id, d.name, d.specialization, COUNT(ds.id) as sale_count, COALESCE(SUM(ds.commission_amount), 0) as total_commission, COALESCE(SUM(si.total), 0) as total_sales FROM doctors d LEFT JOIN doctor_sales ds ON d.id = ds.doctor_id LEFT JOIN sales_invoices si ON ds.sales_invoice_id = si.id`;
    const params: any[] = [];
    if (from || to) { sql += ' WHERE'; }
    if (from) { sql += ' si.invoice_date >= ?'; params.push(from); }
    if (from && to) sql += ' AND';
    if (to) { sql += ' si.invoice_date <= ?'; params.push(to); }
    sql += ' GROUP BY d.id, d.name, d.specialization ORDER BY total_sales DESC';
    const stats = await query(sql, params);
    res.json(stats);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const doctor = await queryOne('SELECT * FROM doctors WHERE id = ?', [req.params.id]);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    const sales = await query(`SELECT ds.*, si.invoice_number, si.invoice_date, si.total FROM doctor_sales ds JOIN sales_invoices si ON ds.sales_invoice_id = si.id WHERE ds.doctor_id = ? ORDER BY si.invoice_date DESC LIMIT 50`, [req.params.id]);
    res.json({ ...doctor, sales });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createDoctorSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes } = req.body;
    const code = await generateCodeAsync('DOC', 'doctors');
    await execute(`INSERT INTO doctors (code, name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, specialization || null, phone || null, email || null, address || null, latitude || null, longitude || null, clinic_name || null, visit_fee || 0, commission_percentage || 0, notes || null]);
    void logActivityAsync(req.user!.id, 'create_doctor', 'doctor');
    res.json({ message: 'Doctor created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes, is_active } = req.body;
    await execute(`UPDATE doctors SET name = COALESCE(?, name), specialization = COALESCE(?, specialization), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), clinic_name = COALESCE(?, clinic_name), visit_fee = COALESCE(?, visit_fee), commission_percentage = COALESCE(?, commission_percentage), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, specialization, phone, email, address, latitude, longitude, clinic_name, visit_fee, commission_percentage, notes, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_doctor', 'doctor', parseInt(req.params.id));
    res.json({ message: 'Doctor updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE doctors SET is_active = 0 WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_doctor', 'doctor', parseInt(req.params.id));
    res.json({ message: 'Doctor deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
