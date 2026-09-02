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
    let sql = 'SELECT * FROM suppliers WHERE is_active = 1';
    const params: any[] = [];
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const countRow = await queryOne(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
    const total = countRow?.total ?? 0;
    sql += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const suppliers = await query(sql, params);
    res.json({ suppliers, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', async (_req: AuthRequest, res: Response) => {
  try {
    const suppliers = await query('SELECT id, code, name, phone, current_balance FROM suppliers WHERE is_active = 1 ORDER BY name');
    res.json(suppliers);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createSupplierSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, tax_number, notes } = req.body;
    const code = await generateCodeAsync('SUP', 'suppliers');
    await execute('INSERT INTO suppliers (code, name, phone, email, address, city, tax_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [code, name, phone || null, email || null, address || null, city || null, tax_number || null, notes || null]);
    void logActivityAsync(req.user!.id, 'create_supplier', 'supplier');
    res.json({ message: 'Supplier created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, tax_number, notes, is_active } = req.body;
    await execute('UPDATE suppliers SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), city = COALESCE(?, city), tax_number = COALESCE(?, tax_number), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name, phone, email, address, city, tax_number, notes, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_supplier', 'supplier', parseInt(req.params.id));
    res.json({ message: 'Supplier updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await execute('UPDATE suppliers SET is_active = 0 WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_supplier', 'supplier', parseInt(req.params.id));
    res.json({ message: 'Supplier deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
