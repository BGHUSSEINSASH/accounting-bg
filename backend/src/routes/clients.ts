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
    const { page = 1, limit = 20, search, sales_rep_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = 'SELECT * FROM clients WHERE is_active = 1';
    const params: any[] = [];
    if (search) { query += ' AND (name LIKE ? OR phone LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (sales_rep_id) { query += ' AND sales_rep_id = ?'; params.push(sales_rep_id); }
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countQuery).get(...params) as any).total;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const clients = db.prepare(query).all(...params);
    res.json({ clients, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const clients = db.prepare('SELECT id, code, name, phone, city, current_balance, credit_limit FROM clients WHERE is_active = 1 ORDER BY name').all();
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/overview', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const invoices = db.prepare("SELECT id, invoice_number, invoice_date, total, paid_amount, remaining_amount, payment_status FROM sales_invoices WHERE client_id = ? ORDER BY invoice_date DESC LIMIT 10").all(req.params.id);
    const payments = db.prepare("SELECT cp.*, si.invoice_number FROM client_payments cp LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.client_id = ? ORDER BY cp.payment_date DESC LIMIT 10").all(req.params.id);
    const totalSales = (db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE client_id = ?").get(req.params.id) as any).total;
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(paid_amount), 0) as total FROM sales_invoices WHERE client_id = ?").get(req.params.id) as any).total;
    res.json({ ...client, invoices, payments, total_sales: totalSales, total_paid: totalPaid });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createClientSchema), (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, classification_id } = req.body;
    const db = getDatabase();
    const code = generateCode('CL', 'clients');
    db.prepare(`INSERT INTO clients (code, name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, classification_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(code, name, phone || null, email || null, address || null, city || null, latitude || null, longitude || null, tax_number || null, credit_limit || 0, sales_rep_id || null, notes || null, classification_id || null);
    logActivity(req.user!.id, 'create_client', 'client');
    res.json({ message: 'Client created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, is_active, classification_id } = req.body;
    const db = getDatabase();
    db.prepare(`UPDATE clients SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), city = COALESCE(?, city), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), tax_number = COALESCE(?, tax_number), credit_limit = COALESCE(?, credit_limit), sales_rep_id = COALESCE(?, sales_rep_id), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active), classification_id = COALESCE(?, classification_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, is_active, classification_id, req.params.id);
    logActivity(req.user!.id, 'update_client', 'client', parseInt(req.params.id));
    res.json({ message: 'Client updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE clients SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'delete_client', 'client', parseInt(req.params.id));
    res.json({ message: 'Client deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Client map data
router.get('/map/data', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const clients = db.prepare('SELECT id, name, latitude, longitude, city, current_balance FROM clients WHERE is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL').all();
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


