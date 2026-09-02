import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/items', async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    const params: any[] = [];
    let sql = "SELECT id, code, name, name_en, barcode, selling_price, purchase_price, current_quantity, unit, category FROM items WHERE is_active = true";
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length} OR barcode ILIKE $${params.length})`;
    }
    sql += " ORDER BY name LIMIT 200";
    const items = await query(sql, params);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, quantity = 1, format = 'CODE128' } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id is required' });

    const item = await query(
      'SELECT id, code, name, barcode, selling_price FROM items WHERE id = $1',
      [item_id]
    ) as any[];

    if (!item.length) return res.status(404).json({ error: 'Item not found' });

    const it = item[0];
    const barcodeValue = it.barcode || it.code;
    const qty = Math.min(Math.max(1, parseInt(String(quantity))), 100);

    // Generate printable HTML with barcodes
    const labels = Array.from({ length: qty }, (_, i) => `
      <div class="label" key="${i}">
        <div class="item-name">${it.name}</div>
        <svg class="barcode" id="barcode-${i}"></svg>
        <div class="barcode-text">${barcodeValue}</div>
        <div class="price">${Number(it.selling_price).toFixed(2)} د.ع</div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>طباعة الباركود - ${it.name}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #fff; }
    .container { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
    .label {
      width: 60mm; border: 1px solid #ddd; padding: 6px;
      text-align: center; page-break-inside: avoid;
      border-radius: 4px;
    }
    .item-name { font-size: 10pt; font-weight: bold; margin-bottom: 4px; }
    .barcode { width: 100%; height: 40px; }
    .barcode-text { font-size: 8pt; color: #555; margin-top: 2px; }
    .price { font-size: 10pt; font-weight: bold; color: #1a56db; margin-top: 4px; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px;background:#f3f4f6;margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#1a56db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
      🖨️ طباعة
    </button>
    <span style="margin-right:12px;font-size:13px;color:#374151;">
      الصنف: ${it.name} | الكمية: ${qty} ملصق
    </span>
  </div>
  <div class="container">
    ${labels}
  </div>
  <script>
    document.querySelectorAll('.barcode').forEach(function(el, i) {
      try {
        JsBarcode(el, '${barcodeValue}', {
          format: '${format}',
          width: 1.5, height: 40,
          displayValue: false,
          margin: 2
        });
      } catch(e) {
        el.parentNode.querySelector('.barcode-text').textContent = '${barcodeValue}';
      }
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
