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
    let query = 'SELECT * FROM suppliers WHERE is_active = 1';
    const params: any[] = [];
    if (search) { query += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const total = (db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as total')).get(...params) as any).total;
    query += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const suppliers = db.prepare(query).all(...params);
    res.json({ suppliers, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/all', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const suppliers = db.prepare('SELECT id, code, name, phone, current_balance FROM suppliers WHERE is_active = 1 ORDER BY name').all();
    res.json(suppliers);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', validate(schemas.createSupplierSchema), (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, tax_number, notes } = req.body;
    const db = getDatabase();
    const code = generateCode('SUP', 'suppliers');
    db.prepare('INSERT INTO suppliers (code, name, phone, email, address, city, tax_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(code, name, phone || null, email || null, address || null, city || null, tax_number || null, notes || null);
    logActivity(req.user!.id, 'create_supplier', 'supplier');
    res.json({ message: 'Supplier created', code });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, address, city, tax_number, notes, is_active } = req.body;
    const db = getDatabase();
    db.prepare('UPDATE suppliers SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), city = COALESCE(?, city), tax_number = COALESCE(?, tax_number), notes = COALESCE(?, notes), is_active = COALESCE(?, is_active) WHERE id = ?')
      .run(name, phone, email, address, city, tax_number, notes, is_active, req.params.id);
    logActivity(req.user!.id, 'update_supplier', 'supplier', parseInt(req.params.id));
    res.json({ message: 'Supplier updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'delete_supplier', 'supplier', parseInt(req.params.id));
    res.json({ message: 'Supplier deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;


