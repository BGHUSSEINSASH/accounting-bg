import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const type = (req.query.type as string || '').trim();
    if (!q || q.length < 2) return res.json({ results: [] });
    const like = `%${q}%`;
    const results: any[] = [];

    const searchClients = async () => {
      const clients = await query(
        "SELECT id, name, phone, code, city FROM clients WHERE name ILIKE $1 OR phone ILIKE $2 OR code ILIKE $3 LIMIT 5",
        [like, like, like]
      ) as any[];
      clients.forEach((c: any) => results.push({
        type: 'client', id: c.id,
        label: c.name,
        subtitle: `${c.phone || ''} ${c.code ? '| ' + c.code : ''} ${c.city ? '| ' + c.city : ''}`.trim(),
        path: `/sales/clients`,
      }));
    };

    const searchItems = async () => {
      const items = await query(
        "SELECT id, name, code, barcode FROM items WHERE name ILIKE $1 OR code ILIKE $2 OR barcode ILIKE $3 LIMIT 5",
        [like, like, like]
      ) as any[];
      items.forEach((it: any) => results.push({
        type: 'item', id: it.id,
        label: `${it.name}${it.code ? ' (' + it.code + ')' : ''}`,
        subtitle: it.barcode ? `باركود: ${it.barcode}` : '',
        path: `/inventory/items`,
      }));
    };

    const searchInvoices = async () => {
      const invoices = await query(
        `SELECT si.id, si.invoice_number, c.name AS client_name, si.total
         FROM sales_invoices si
         LEFT JOIN clients c ON si.client_id = c.id
         WHERE si.invoice_number ILIKE $1 OR c.name ILIKE $2
         LIMIT 5`,
        [like, like]
      ) as any[];
      invoices.forEach((inv: any) => results.push({
        type: 'invoice', id: inv.id,
        label: `${inv.invoice_number} - ${inv.client_name || 'نقدي'}`,
        subtitle: `فاتورة - ${inv.total || 0}`,
        path: `/sales/invoices`,
      }));
    };

    const searchSuppliers = async () => {
      const suppliers = await query(
        "SELECT id, name, phone FROM suppliers WHERE name ILIKE $1 OR phone ILIKE $2 LIMIT 5",
        [like, like]
      ) as any[];
      suppliers.forEach((s: any) => results.push({
        type: 'supplier', id: s.id,
        label: s.name,
        subtitle: s.phone || '',
        path: `/sales/suppliers`,
      }));
    };

    if (!type || type === 'clients') await searchClients();
    if (!type || type === 'items') await searchItems();
    if (!type || type === 'invoices') await searchInvoices();
    if (!type || type === 'suppliers') await searchSuppliers();

    // If no specific type filter, also search employees
    if (!type) {
      const employees = await query(
        "SELECT id, full_name, phone, department FROM users WHERE full_name ILIKE $1 OR phone ILIKE $2 LIMIT 5",
        [like, like]
      ) as any[];
      employees.forEach((emp: any) => results.push({
        type: 'employee', id: emp.id,
        label: emp.full_name,
        subtitle: emp.department || emp.phone || '',
        path: `/hr/employees`,
      }));
    }

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message, results: [] });
  }
});

export default router;

