import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, getPool, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

function monthKey(dateStr: string): string {
  return (dateStr || new Date().toISOString().split('T')[0]).slice(0, 7);
}

export async function isPeriodClosed(period: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM period_closings WHERE period = ?', [period]);
  return !!row;
}

router.get('/period-closings', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT pc.*, u.username as closed_by_name FROM period_closings pc LEFT JOIN users u ON pc.closed_by = u.id ORDER BY pc.period DESC`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/period-closings', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { period, notes } = req.body;
    if (!period) return res.status(400).json({ error: 'الشهر مطلوب (YYYY-MM)' });
    const exists = await queryOne('SELECT id FROM period_closings WHERE period = ?', [period]);
    if (exists) return res.status(400).json({ error: 'هذه الفترة مقفلة مسبقاً' });
    await execute('INSERT INTO period_closings (period, closed_by, notes) VALUES (?, ?, ?)', [period, req.user!.id, notes || null]);
    void logActivityAsync(req.user!.id, 'close_period', 'period_closing');
    res.json({ message: 'تم إقفال الفترة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/period-closings/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM period_closings WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم فتح الفترة' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/period-closings/status', async (req: AuthRequest, res: Response) => {
  try {
    const period = monthKey(String(req.query.date || ''));
    const closed = await isPeriodClosed(period);
    res.json({ period, closed });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/petty-cash', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT pca.*, p.name as parent_name, (SELECT COUNT(*) FROM petty_cash_transactions pct WHERE pct.account_id = pca.id) as transactions_count, (SELECT COUNT(*) FROM petty_cash_accounts c WHERE c.parent_id = pca.id) as children_count FROM petty_cash_accounts pca LEFT JOIN petty_cash_accounts p ON pca.parent_id = p.id ORDER BY pca.code`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/petty-cash/tree', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT pca.*, p.name as parent_name FROM petty_cash_accounts pca LEFT JOIN petty_cash_accounts p ON pca.parent_id = p.id ORDER BY pca.code`) as any[];
    const byId = new Map<number, any>();
    rows.forEach((r: any) => byId.set(r.id, { ...r, children: [] }));
    const roots: any[] = [];
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) { byId.get(node.parent_id).children.push(node); }
      else { roots.push(node); }
    }
    const total = rows.reduce((s, r) => s + (r.balance || 0), 0);
    res.json({ tree: roots, total, funds_count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/petty-cash', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, initial_balance, parent_id, currency_code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'الاسم والكود مطلوبان' });
    const result = await execute('INSERT INTO petty_cash_accounts (name, code, balance, parent_id, currency_code) VALUES (?, ?, ?, ?, ?)',
      [name, code, initial_balance || 0, parent_id || null, currency_code || 'IQD']);
    void logActivityAsync(req.user!.id, 'create_petty_cash', 'petty_cash', result.id as number);
    res.json({ message: 'تم إنشاء الصندوق', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/petty-cash/:id', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, parent_id, is_active, currency_code } = req.body;
    const account = await queryOne('SELECT * FROM petty_cash_accounts WHERE id = ?', [req.params.id]) as any;
    if (!account) return res.status(404).json({ error: 'الصندوق غير موجود' });
    if (parent_id && Number(parent_id) === Number(req.params.id)) return res.status(400).json({ error: 'لا يمكن جعل الصندوق أباً لنفسه' });
    await withTransaction(async (client) => {
      if (parent_id) {
        const cycle = await client.query('SELECT id FROM petty_cash_accounts WHERE id = $1 AND parent_id = $2', [Number(req.params.id), Number(parent_id)]).then(r => r.rows[0]);
        if (cycle) throw new Error('لا يمكن إنشاء دورة في الهرمية');
      }
      await client.query(`UPDATE petty_cash_accounts SET name = COALESCE($1, name), code = COALESCE($2, code), parent_id = $3, is_active = COALESCE($4, is_active), currency_code = COALESCE($5, currency_code) WHERE id = $6`,
        [name || null, code || null, parent_id === undefined || parent_id === null || parent_id === '' ? null : Number(parent_id), is_active ?? null, currency_code || null, req.params.id]);
    });
    void logActivityAsync(req.user!.id, 'update_petty_cash', 'petty_cash', Number(req.params.id));
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/petty-cash/transfers', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT cft.*, fa.name as from_name, fa.code as from_code, ta.name as to_name, ta.code as to_code, u.username as created_by_name FROM cash_fund_transfers cft JOIN petty_cash_accounts fa ON cft.from_account_id = fa.id JOIN petty_cash_accounts ta ON cft.to_account_id = ta.id LEFT JOIN users u ON cft.created_by = u.id ORDER BY cft.transfer_date DESC, cft.id DESC LIMIT 200`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/petty-cash/:id/transfer', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { to_account_id, amount, transfer_date, description } = req.body;
    if (!to_account_id || !amount) return res.status(400).json({ error: 'الصندوق المستهدف والمبلغ مطلوبان' });
    const amountNum = Number(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    if (Number(to_account_id) === Number(req.params.id)) return res.status(400).json({ error: 'لا يمكن التحويل لنفس الصندوق' });
    const from = await queryOne('SELECT * FROM petty_cash_accounts WHERE id = ?', [req.params.id]) as any;
    const to = await queryOne('SELECT * FROM petty_cash_accounts WHERE id = ?', [to_account_id]) as any;
    if (!from || !to) return res.status(404).json({ error: 'أحد الصناديق غير موجود' });
    if ((from.balance || 0) < amountNum) return res.status(400).json({ error: 'الرصيد غير كافٍ في الصندوق المصدر' });
    const date = transfer_date || new Date().toISOString().split('T')[0];
    const period = monthKey(date);
    if (await isPeriodClosed(period)) return res.status(400).json({ error: `الفترة ${period} مقفلة` });
    const id = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO cash_fund_transfers (from_account_id, to_account_id, transfer_date, amount, description, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [req.params.id, to_account_id, date, amountNum, description || null, req.user!.id]);
      const tid = result.rows[0].id;
      await client.query('UPDATE petty_cash_accounts SET balance = balance - $1 WHERE id = $2', [amountNum, req.params.id]);
      await client.query('UPDATE petty_cash_accounts SET balance = balance + $1 WHERE id = $2', [amountNum, to_account_id]);
      await client.query('INSERT INTO petty_cash_transactions (account_id, transaction_date, type, amount, description, category, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, date, 'out', amountNum, description ? `تحويل إلى ${to.name}: ${description}` : `تحويل إلى ${to.name}`, 'تحويل داخلي', req.user!.id]);
      await client.query('INSERT INTO petty_cash_transactions (account_id, transaction_date, type, amount, description, category, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [to_account_id, date, 'in', amountNum, description ? `تحويل من ${from.name}: ${description}` : `تحويل من ${from.name}`, 'تحويل داخلي', req.user!.id]);
      return tid;
    });
    void logActivityAsync(req.user!.id, 'cash_transfer', 'cash_fund_transfer', id as number);
    res.json({ message: 'تم التحويل', id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/petty-cash/:id/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const txs = await query(`SELECT pct.*, u.username as created_by_name FROM petty_cash_transactions pct LEFT JOIN users u ON pct.created_by = u.id WHERE pct.account_id = ? ORDER BY pct.transaction_date DESC, pct.id DESC`, [req.params.id]);
    res.json(txs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/petty-cash/:id/transactions', authorize('admin', 'accountant', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { transaction_date, type, amount, description, category } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'النوع والمبلغ مطلوبان' });
    const account = await queryOne('SELECT * FROM petty_cash_accounts WHERE id = ?', [req.params.id]) as any;
    if (!account) return res.status(404).json({ error: 'الصندوق غير موجود' });
    const period = monthKey(transaction_date || new Date().toISOString());
    if (await isPeriodClosed(period)) return res.status(400).json({ error: `الفترة ${period} مقفلة` });
    const id = await withTransaction(async (client) => {
      const result = await client.query('INSERT INTO petty_cash_transactions (account_id, transaction_date, type, amount, description, category, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [req.params.id, transaction_date || new Date().toISOString().split('T')[0], type, amount, description || null, category || null, req.user!.id]);
      const delta = type === 'in' ? Number(amount) : -Number(amount);
      await client.query('UPDATE petty_cash_accounts SET balance = balance + $1 WHERE id = $2', [delta, req.params.id]);
      return result.rows[0].id;
    });
    void logActivityAsync(req.user!.id, 'petty_cash_tx', 'petty_cash_transaction', id as number);
    res.json({ message: 'تم تسجيل العملية', id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/petty-cash/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM petty_cash_accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/currencies', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await query('SELECT *, exchange_rate AS rate FROM currencies ORDER BY is_base DESC, code'));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/currencies', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, rate, exchange_rate, is_base } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'الكود والاسم مطلوبان' });
    const id = await withTransaction(async (client) => {
      if (is_base) await client.query('UPDATE currencies SET is_base = 0');
      const result = await client.query('INSERT INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [code.toUpperCase(), name, symbol || '', rate ?? exchange_rate ?? 1, is_base ? 1 : 0]);
      if (is_base) await client.query("UPDATE settings SET setting_value = $1 WHERE setting_key = 'base_currency'", [code.toUpperCase()]);
      return result.rows[0].id;
    });
    res.json({ message: 'تمت إضافة العملة', id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/currencies/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, symbol, rate, exchange_rate, is_base, is_active } = req.body;
    await withTransaction(async (client) => {
      if (is_base === true || is_base === 1) {
        await client.query('UPDATE currencies SET is_base = 0');
        await client.query('UPDATE currencies SET is_base = 1 WHERE id = $1', [req.params.id]);
        const targetCode = code ? String(code).toUpperCase() : ((await client.query('SELECT code FROM currencies WHERE id = $1', [req.params.id]).then(r => r.rows[0]))?.code || 'IQD');
        await client.query("UPDATE settings SET setting_value = $1 WHERE setting_key = 'base_currency'", [targetCode]);
      }
      await client.query(`UPDATE currencies SET code = COALESCE($1, code), name = COALESCE($2, name), symbol = COALESCE($3, symbol), exchange_rate = COALESCE($4, exchange_rate), is_active = COALESCE($5, is_active) WHERE id = $6`,
        [code ? String(code).toUpperCase() : null, name || null, symbol || null, rate ?? exchange_rate ?? null, is_active === undefined ? null : (is_active ? 1 : 0), req.params.id]);
    });
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/currencies/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM currencies WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/currencies/rate', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'معلمات from و to مطلوبة' });
    const { currencyService } = await import('../services/currencyService');
    const rate = await currencyService.getExchangeRate(String(from), String(to));
    res.json({ from, to, rate });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/currencies/convert', async (req: AuthRequest, res: Response) => {
  try {
    const { amount, from, to } = req.query;
    if (!amount || !from || !to) return res.status(400).json({ error: 'معلمات amount و from و to مطلوبة' });
    const { currencyService } = await import('../services/currencyService');
    const converted = await currencyService.convert(parseFloat(String(amount)), String(from), String(to));
    const rate = await currencyService.getExchangeRate(String(from), String(to));
    res.json({ amount: parseFloat(String(amount)), from, to, converted, rate });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/currencies/rate-on-date', async (req: AuthRequest, res: Response) => {
  try {
    const { currencyService } = await import('../services/currencyService');
    const { code, date } = req.query;
    if (!code || !date) return res.status(400).json({ error: 'معلمات code و date مطلوبة' });
    let rate = await currencyService.getRateForDate(String(code), String(date));
    if (rate === null) {
      const currency = await currencyService.getCurrencyByCode(String(code));
      rate = currency?.exchange_rate ?? null;
    }
    res.json({ code, date, rate });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/currencies/:code/history', async (req: AuthRequest, res: Response) => {
  try {
    const { currencyService } = await import('../services/currencyService');
    const { from, to } = req.query;
    const history = await currencyService.getRateHistory(String(req.params.code), from ? String(from) : undefined, to ? String(to) : undefined);
    res.json(history);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/currencies/:code/history', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { currencyService } = await import('../services/currencyService');
    const { rate_date, exchange_rate } = req.body;
    if (!rate_date || !exchange_rate) return res.status(400).json({ error: 'التاريخ والسعر مطلوبان' });
    await currencyService.recordRateHistory(String(req.params.code), rate_date, Number(exchange_rate), 'manual', req.user!.id);
    const today = new Date().toISOString().split('T')[0];
    if (rate_date >= today) {
      await currencyService.updateCurrencyByCode(String(req.params.code), Number(exchange_rate));
    }
    void logActivityAsync(req.user!.id, 'record_rate_history', 'currency', undefined, `سعر ${req.params.code} بتاريخ ${rate_date}`);
    res.json({ message: 'تم حفظ السعر' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/currency-gains-losses', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (from) { where += ' AND created_at >= ?'; params.push(String(from)); }
    if (to) { where += ' AND created_at <= ?'; params.push(String(to) + ' 23:59:59'); }
    const rows = await query(`SELECT * FROM currency_gains_losses ${where} ORDER BY created_at DESC LIMIT 200`, params);
    const gains = await queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM currency_gains_losses ${where} AND entry_type = 'gain'`, params) as any;
    const losses = await queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM currency_gains_losses ${where} AND entry_type = 'loss'`, params) as any;
    res.json({ items: rows, summary: { totalGain: gains?.total || 0, totalLoss: losses?.total || 0, net: (gains?.total || 0) - (losses?.total || 0) } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/doubtful-debts', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT dd.*, c.name as client_name, c.phone as client_phone, si.invoice_number FROM doubtful_debts dd LEFT JOIN clients c ON dd.client_id = c.id LEFT JOIN sales_invoices si ON dd.invoice_id = si.id ORDER BY dd.created_at DESC`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/doubtful-debts', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, invoice_id, amount, reason, notes } = req.body;
    if (!amount) return res.status(400).json({ error: 'المبلغ مطلوب' });
    const result = await execute('INSERT INTO doubtful_debts (client_id, invoice_id, amount, reason, notes) VALUES (?, ?, ?, ?, ?)',
      [client_id || null, invoice_id || null, amount, reason || null, notes || null]);
    void logActivityAsync(req.user!.id, 'mark_doubtful_debt', 'doubtful_debt', result.id as number);
    res.json({ message: 'تم التسجيل', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/doubtful-debts/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['open', 'collected', 'written_off'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    await execute('UPDATE doubtful_debts SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/doubtful-debts/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM doubtful_debts WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/coa-templates', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await query('SELECT * FROM coa_templates ORDER BY is_builtin DESC, name'));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/coa-templates', authorize('admin', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, accounts_json } = req.body;
    if (!name || !accounts_json) return res.status(400).json({ error: 'الاسم وبيانات الحسابات مطلوبة' });
    const result = await execute('INSERT INTO coa_templates (name, description, accounts_json, is_builtin) VALUES (?, ?, ?, 0)',
      [name, description || null, typeof accounts_json === 'string' ? accounts_json : JSON.stringify(accounts_json)]);
    res.json({ message: 'تم حفظ القالب', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/coa-templates/:id/apply', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const template = await queryOne('SELECT * FROM coa_templates WHERE id = ?', [req.params.id]) as any;
    if (!template) return res.status(404).json({ error: 'القالب غير موجود' });
    const accounts = typeof template.accounts_json === 'string' ? JSON.parse(template.accounts_json) : template.accounts_json;
    const created = await withTransaction(async (client) => {
      let count = 0;
      for (const acc of accounts) {
        const exists = await client.query('SELECT id FROM accounts WHERE code = $1', [acc.code]).then(r => r.rows[0]);
        if (exists) continue;
        let parentId: number | null = null;
        if (acc.parent_code) {
          const parent = await client.query('SELECT id FROM accounts WHERE code = $1', [acc.parent_code]).then(r => r.rows[0]);
          parentId = parent ? parent.id : null;
        }
        await client.query('INSERT INTO accounts (code, name, name_en, type, parent_id, level, is_active) VALUES ($1,$2,$3,$4,$5,$6,1)',
          [acc.code, acc.name, acc.name_en || null, acc.type, parentId, acc.level || 0]);
        count++;
      }
      return count;
    });
    void logActivityAsync(req.user!.id, 'apply_coa_template', 'coa_template', template.id);
    res.json({ message: `تم تطبيق القالب: إنشاء ${created} حساب` });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/coa-templates/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM coa_templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/export/excel', (req: AuthRequest, res: Response) => {
  try {
    const { rows, sheetName } = req.body;
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'لا توجد بيانات للتصدير' });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Sheet1').slice(0, 31));
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=export.xlsx');
    res.send(buffer);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
