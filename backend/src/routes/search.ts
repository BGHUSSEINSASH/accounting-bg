import { Router, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) return res.json({ results: [] });
    const like = `%${q}%`;
    const results: any[] = [];
    const invoices = await query("SELECT si.id, si.invoice_number, c.name AS client_name, si.total FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.invoice_number LIKE ? OR c.name LIKE ? LIMIT 5", [like, like]) as any[];
    invoices.forEach((inv: any) => results.push({ type: 'invoice', id: inv.id, label: `${inv.invoice_number} - ${inv.client_name || ''}`, subtitle: `فاتورة - ${inv.total || 0}`, path: `/sales/invoices` }));
    const clients = await query("SELECT id, name, phone, city FROM clients WHERE name LIKE ? OR phone LIKE ? LIMIT 5", [like, like]) as any[];
    clients.forEach((c: any) => results.push({ type: 'client', id: c.id, label: c.name, subtitle: `${c.phone || ''} ${c.city ? '| ' + c.city : ''}`, path: `/sales/clients` }));
    const suppliers = await query("SELECT id, name, phone FROM suppliers WHERE name LIKE ? OR phone LIKE ? LIMIT 5", [like, like]) as any[];
    suppliers.forEach((s: any) => results.push({ type: 'supplier', id: s.id, label: s.name, subtitle: s.phone || '', path: `/sales/suppliers` }));
    const items = await query("SELECT id, name, code, barcode FROM items WHERE name LIKE ? OR code LIKE ? OR barcode LIKE ? LIMIT 5", [like, like, like]) as any[];
    items.forEach((it: any) => results.push({ type: 'item', id: it.id, label: `${it.name} (${it.code || ''})`, subtitle: it.barcode ? `باركود: ${it.barcode}` : '', path: `/inventory/items` }));
    const employees = await query("SELECT id, full_name, phone, department FROM users WHERE full_name LIKE ? OR phone LIKE ? LIMIT 5", [like, like]) as any[];
    employees.forEach((emp: any) => results.push({ type: 'employee', id: emp.id, label: emp.full_name, subtitle: emp.department || emp.phone || '', path: `/hr/employees` }));
    res.json({ results });
  } catch (err: any) { res.status(500).json({ error: err.message, results: [] }); }
});

export default router;
