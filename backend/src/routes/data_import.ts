import { Router, Response } from 'express';
import { execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

function parseBase64(data: string): XLSX.WorkBook {
  const base64 = data.includes(',') ? data.split(',')[1] : data;
  const buf = Buffer.from(base64, 'base64');
  return XLSX.read(buf, { type: 'buffer' });
}

function getSheet(wb: XLSX.WorkBook, sheetIndex: number): any[] {
  const sheetName = wb.SheetNames[Math.min(sheetIndex || 0, wb.SheetNames.length - 1)];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
}

function pick(row: any, keys: string[]): any {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  return null;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[,%\s]/g, ''));
  return isNaN(n) ? null : n;
}

function genCode(prefix: string): string {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
}

const { getPool } = require('../config/database');

async function queryDB(sql: string, params: any[]) {
  const { convertPlaceholders } = require('../config/database');
  const pool = getPool();
  // convert ? to $N
  let idx = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
  const result = await pool.query(pgSql, params);
  return result.rows[0] || null;
}

router.post('/items', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, sheet = 0, mode = 'skip' } = req.body;
    if (!data) return res.status(400).json({ error: 'File data is required' });
    const rows = getSheet(parseBase64(data), Number(sheet));
    let imported = 0, skipped = 0, updated = 0;
    const errors: any[] = [];
    const pool = getPool();
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      try {
        const name = pick(row, ['name', 'الاسم', 'اسم الصنف', 'item_name', 'المنتج']);
        if (!name) { errors.push({ row: idx + 2, error: 'missing name' }); continue; }
        const barcode = pick(row, ['barcode', 'باركود', 'رمز الباركود', 'sku']);
        const code = pick(row, ['code', 'الكود', 'رمز الصنف', 'item_code']) || barcode || genCode('IMP');
        let existing = null;
        if (barcode) { const r = await pool.query('SELECT id FROM items WHERE barcode = $1', [barcode]); existing = r.rows[0]; }
        if (!existing && !barcode) { const r = await pool.query('SELECT id FROM items WHERE code = $1', [code]); existing = r.rows[0]; }
        if (!existing) { const r = await pool.query('SELECT id FROM items WHERE name = $1', [name]); existing = r.rows[0]; }
        if (existing) {
          if (mode === 'update') {
            await pool.query(`UPDATE items SET name_en = COALESCE($1, name_en), category = COALESCE($2, category), unit = COALESCE($3, unit), purchase_price = COALESCE($4, purchase_price), selling_price = COALESCE($5, selling_price), current_quantity = COALESCE($6, current_quantity), min_quantity = COALESCE($7, min_quantity), max_quantity = COALESCE($8, max_quantity), barcode = COALESCE($9, barcode), updated_at = NOW() WHERE id = $10`,
              [pick(row, ['name_en', 'الاسم بالإنجليزية']), pick(row, ['category', 'الفئة', 'التصنيف']), pick(row, ['unit', 'الوحدة']),
               num(pick(row, ['purchase_price', 'سعر الشراء', 'التكلفة'])), num(pick(row, ['selling_price', 'سعر البيع'])),
               num(pick(row, ['current_quantity', 'الكمية الحالية', 'المخزن'])), num(pick(row, ['min_quantity', 'حد الطلب', 'الحد الأدنى'])),
               num(pick(row, ['max_quantity', 'الحد الأعلى'])), barcode, existing.id]);
            updated++;
          } else skipped++;
        } else {
          await pool.query(`INSERT INTO items (code, name, name_en, category, unit, purchase_price, selling_price, current_quantity, min_quantity, max_quantity, barcode, external_ref, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)`,
            [code, name, pick(row, ['name_en', 'الاسم بالإنجليزية']), pick(row, ['category', 'الفئة', 'التصنيف']),
             pick(row, ['unit', 'الوحدة']) || 'قطعة', num(pick(row, ['purchase_price', 'سعر الشراء', 'التكلفة'])) || 0,
             num(pick(row, ['selling_price', 'سعر البيع'])) || 0, num(pick(row, ['current_quantity', 'الكمية الحالية', 'المخزن'])) || 0,
             num(pick(row, ['min_quantity', 'حد الطلب', 'الحد الأدنى'])) || 5, num(pick(row, ['max_quantity', 'الحد الأعلى'])) || 100,
             barcode, pick(row, ['external_ref', 'المرجع الخارجي'])]);
          imported++;
        }
      } catch (e: any) { errors.push({ row: idx + 2, error: e.message }); }
    }
    void logActivityAsync(req.user!.id, 'import_items', 'items', imported + updated);
    res.json({ imported, updated, skipped, errors: errors.slice(0, 50), total_rows: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/clients', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, sheet = 0, mode = 'skip' } = req.body;
    if (!data) return res.status(400).json({ error: 'File data is required' });
    const rows = getSheet(parseBase64(data), Number(sheet));
    let imported = 0, skipped = 0, updated = 0;
    const errors: any[] = [];
    const pool = getPool();
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      try {
        const name = pick(row, ['name', 'الاسم', 'اسم العميل']);
        if (!name) { errors.push({ row: idx + 2, error: 'missing name' }); continue; }
        const phone = pick(row, ['phone', 'الهاتف', 'الجوال', 'رقم الهاتف']);
        const code = pick(row, ['code', 'الكود', 'رمز العميل']) || genCode('C');
        let existing = null;
        const r1 = await pool.query('SELECT id FROM clients WHERE name = $1', [name]); existing = r1.rows[0];
        if (!existing && phone) { const r2 = await pool.query('SELECT id FROM clients WHERE phone = $1', [phone]); existing = r2.rows[0]; }
        if (existing) {
          if (mode === 'update') {
            await pool.query(`UPDATE clients SET phone = COALESCE($1, phone), email = COALESCE($2, email), address = COALESCE($3, address), city = COALESCE($4, city), tax_number = COALESCE($5, tax_number), credit_limit = COALESCE($6, credit_limit), updated_at = NOW() WHERE id = $7`,
              [phone, pick(row, ['email', 'البريد الإلكتروني']), pick(row, ['address', 'العنوان']), pick(row, ['city', 'المدينة']),
               pick(row, ['tax_number', 'الرقم الضريبي']), num(pick(row, ['credit_limit', 'حد الائتمان'])), existing.id]);
            updated++;
          } else skipped++;
        } else {
          await pool.query(`INSERT INTO clients (code, name, phone, email, address, city, tax_number, credit_limit, notes, external_ref, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
            [code, name, phone, pick(row, ['email', 'البريد الإلكتروني']), pick(row, ['address', 'العنوان']), pick(row, ['city', 'المدينة']),
             pick(row, ['tax_number', 'الرقم الضريبي']), num(pick(row, ['credit_limit', 'حد الائتمان'])) || 0,
             pick(row, ['notes', 'ملاحظات']), pick(row, ['external_ref', 'المرجع الخارجي'])]);
          imported++;
        }
      } catch (e: any) { errors.push({ row: idx + 2, error: e.message }); }
    }
    void logActivityAsync(req.user!.id, 'import_clients', 'clients', imported + updated);
    res.json({ imported, updated, skipped, errors: errors.slice(0, 50), total_rows: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/suppliers', authorize('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, sheet = 0, mode = 'skip' } = req.body;
    if (!data) return res.status(400).json({ error: 'File data is required' });
    const rows = getSheet(parseBase64(data), Number(sheet));
    let imported = 0, skipped = 0, updated = 0;
    const errors: any[] = [];
    const pool = getPool();
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      try {
        const name = pick(row, ['name', 'الاسم', 'اسم المورد']);
        if (!name) { errors.push({ row: idx + 2, error: 'missing name' }); continue; }
        const phone = pick(row, ['phone', 'الهاتف', 'الجوال', 'رقم الهاتف']);
        const code = pick(row, ['code', 'الكود', 'رمز المورد']) || genCode('S');
        let existing = null;
        const r1 = await pool.query('SELECT id FROM suppliers WHERE name = $1', [name]); existing = r1.rows[0];
        if (!existing && phone) { const r2 = await pool.query('SELECT id FROM suppliers WHERE phone = $1', [phone]); existing = r2.rows[0]; }
        if (existing) {
          if (mode === 'update') {
            await pool.query(`UPDATE suppliers SET phone = COALESCE($1, phone), email = COALESCE($2, email), address = COALESCE($3, address), city = COALESCE($4, city), tax_number = COALESCE($5, tax_number), updated_at = NOW() WHERE id = $6`,
              [phone, pick(row, ['email', 'البريد الإلكتروني']), pick(row, ['address', 'العنوان']), pick(row, ['city', 'المدينة']),
               pick(row, ['tax_number', 'الرقم الضريبي']), existing.id]);
            updated++;
          } else skipped++;
        } else {
          await pool.query(`INSERT INTO suppliers (code, name, phone, email, address, city, tax_number, notes, external_ref, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)`,
            [code, name, phone, pick(row, ['email', 'البريد الإلكتروني']), pick(row, ['address', 'العنوان']), pick(row, ['city', 'المدينة']),
             pick(row, ['tax_number', 'الرقم الضريبي']), pick(row, ['notes', 'ملاحظات']), pick(row, ['external_ref', 'المرجع الخارجي'])]);
          imported++;
        }
      } catch (e: any) { errors.push({ row: idx + 2, error: e.message }); }
    }
    void logActivityAsync(req.user!.id, 'import_suppliers', 'suppliers', imported + updated);
    res.json({ imported, updated, skipped, errors: errors.slice(0, 50), total_rows: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

const TEMPLATES: Record<string, any[]> = {
  items: [{ name: 'صنف تجريبي', code: 'ITM001', barcode: '6281000000001', category: 'منتج', unit: 'قطعة', purchase_price: 10, selling_price: 15, current_quantity: 50, min_quantity: 5, max_quantity: 100, name_en: 'Sample Item' }],
  clients: [{ name: 'عميل تجريبي', code: 'C001', phone: '0555555555', email: 'client@example.com', address: 'الرياض', city: 'الرياض', tax_number: '310000000000003', credit_limit: 1000, notes: '' }],
  suppliers: [{ name: 'مورد تجريبي', code: 'S001', phone: '0555555555', email: 'supplier@example.com', address: 'جدة', city: 'جدة', tax_number: '310000000000003', notes: '' }],
};

router.get('/template/:type', (req: AuthRequest, res: Response) => {
  try {
    const rows = TEMPLATES[req.params.type as string];
    if (!rows) return res.status(404).json({ error: 'Unknown template type. Use items, clients, or suppliers.' });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length * 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, req.params.type);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`template-${req.params.type}.xlsx`)}`);
    res.send(buffer);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
