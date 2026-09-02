import { Router, Response } from 'express';
import { query, queryOne, execute, generateCodeAsync, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search, sales_rep_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = 'SELECT * FROM clients WHERE is_active = 1';
    const params: any[] = [];
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (sales_rep_id) { sql += ' AND sales_rep_id = ?'; params.push(sales_rep_id); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countRow = await queryOne(countSql, params);
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const clients = await query(sql, params);
    res.json({ clients, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', async (_req: AuthRequest, res: Response) => {
  try {
    const clients = await query('SELECT id, code, name, phone, city, current_balance, credit_limit FROM clients WHERE is_active = 1 ORDER BY name');
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/map/data', async (_req: AuthRequest, res: Response) => {
  try {
    const clients = await query('SELECT id, name, latitude, longitude, city, current_balance FROM clients WHERE is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL');
    res.json(clients);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/overview', async (req: AuthRequest, res: Response) => {
  try {
    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.params.id]) as any;
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const invoices = await query("SELECT id, invoice_number, invoice_date, total, paid_amount, remaining_amount, payment_status FROM sales_invoices WHERE client_id = ? ORDER BY invoice_date DESC LIMIT 10", [req.params.id]);
    const payments = await query("SELECT cp.*, si.invoice_number FROM client_payments cp LEFT JOIN sales_invoices si ON cp.sales_invoice_id = si.id WHERE cp.client_id = ? ORDER BY cp.payment_date DESC LIMIT 10", [req.params.id]);
    const totalSalesRow = await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE client_id = ?", [req.params.id]);
    const totalPaidRow = await queryOne("SELECT COALESCE(SUM(paid_amount), 0) as total FROM sales_invoices WHERE client_id = ?", [req.params.id]);
    res.json({ ...client, invoices, payments, total_sales: totalSalesRow?.total, total_paid: totalPaidRow?.total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createClientSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, classification_id } = req.body;
    const code = await generateCodeAsync('CL', 'clients');
    await execute(`INSERT INTO clients (code, name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, classification_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, phone || null, email || null, address || null, city || null, latitude || null, longitude || null, tax_number || null, credit_limit || 0, sales_rep_id || null, notes || null, classification_id || null]);
    void logActivityAsync(req.user!.id, 'create_client', 'client');
    res.json({ message: 'Client created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, is_active, classification_id } = req.body;
    await execute(`UPDATE clients SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), city = COALESCE(?, city), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), tax_number = COALESCE(?, tax_number), credit_limit = COALESCE(?, credit_limit), sales_rep_id = COALESCE(?, sales_rep_id), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active), classification_id = COALESCE(?, classification_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, phone, email, address, city, latitude, longitude, tax_number, credit_limit, sales_rep_id, notes, is_active, classification_id, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_client', 'client', parseInt(req.params.id));
    res.json({ message: 'Client updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE clients SET is_active = 0 WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_client', 'client', parseInt(req.params.id));
    res.json({ message: 'Client deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
