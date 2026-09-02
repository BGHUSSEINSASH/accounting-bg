import { getDatabase } from '../config/database';

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: number;
  is_active: number;
  created_at: string;
}

export class CurrencyService {
  private static instance: CurrencyService;
  private cache: Currency[] | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  private getDb() {
    return getDatabase();
  }

  async getAllCurrencies(forceRefresh = false): Promise<Currency[]> {
    const now = Date.now();
    if (this.cache && !forceRefresh && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache;
    }
    const db = this.getDb();
    this.cache = db.prepare('SELECT * FROM currencies WHERE is_active = 1 ORDER BY is_base DESC, code').all() as Currency[];
    this.cacheTime = now;
    return this.cache;
  }

  async getCurrencyByCode(code: string): Promise<Currency | undefined> {
    const currencies = await this.getAllCurrencies();
    return currencies.find(c => c.code === code.toUpperCase());
  }

  async getBaseCurrency(): Promise<Currency> {
    const currencies = await this.getAllCurrencies();
    const base = currencies.find(c => c.is_base === 1);
    if (base) return base;
    return currencies[0] || { code: 'IQD', name: 'Iraqi Dinar', symbol: 'د.ع', exchange_rate: 1, is_base: 1, is_active: 1, id: 0, created_at: '' };
  }

  async getExchangeRate(fromCode: string, toCode: string): Promise<number> {
    if (fromCode === toCode) return 1;

    const from = await this.getCurrencyByCode(fromCode);
    const to = await this.getCurrencyByCode(toCode);

    if (!from || !to) {
      throw new Error(`Currency not found: ${fromCode} or ${toCode}`);
    }

    // exchange_rate means: 1 unit of this currency = exchange_rate units of BASE currency (IQD)
    const fromRate = from.exchange_rate || 1;
    const toRate = to.exchange_rate || 1;

    // Convert from -> base -> to
    // amount in base = amount * fromRate
    // amount in to = amount in base / toRate = amount * fromRate / toRate
    return fromRate / toRate;
  }

  async convert(amount: number, fromCode: string, toCode: string): Promise<number> {
    if (fromCode === toCode) return amount;
    const rate = await this.getExchangeRate(fromCode, toCode);
    return Math.round(amount * rate * 1000) / 1000;
  }

  async toBaseCurrency(amount: number, fromCode: string): Promise<number> {
    const base = await this.getBaseCurrency();
    return this.convert(amount, fromCode, base.code);
  }

  async fromBaseCurrency(amount: number, toCode: string): Promise<number> {
    const base = await this.getBaseCurrency();
    return this.convert(amount, base.code, toCode);
  }

  async setBaseCurrency(code: string): Promise<void> {
    const db = this.getDb();
    const trx = db.transaction(() => {
      db.prepare('UPDATE currencies SET is_base = 0').run();
      db.prepare('UPDATE currencies SET is_base = 1 WHERE code = ?').run(code.toUpperCase());
      db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = 'base_currency'").run(code.toUpperCase());
    });
    trx();
    this.cache = null;
  }

  async createCurrency(data: { code: string; name: string; symbol: string; exchange_rate: number; is_base: boolean }): Promise<number> {
    const db = this.getDb();
    const trx = db.transaction(() => {
      if (data.is_base) {
        db.prepare('UPDATE currencies SET is_base = 0').run();
        db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = 'base_currency'").run(data.code.toUpperCase());
      }
      const result = db.prepare('INSERT INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES (?, ?, ?, ?, ?)')
        .run(data.code.toUpperCase(), data.name, data.symbol || '', data.exchange_rate || 1, data.is_base ? 1 : 0);
      return result.lastInsertRowid;
    });
    const id = trx();
    this.cache = null;
    return id as number;
  }

  async updateCurrency(id: number, data: Partial<Currency>): Promise<void> {
    const db = this.getDb();
    const trx = db.transaction(() => {
      if (data.is_base) {
        db.prepare('UPDATE currencies SET is_base = 0').run();
        if (data.code) {
          db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = 'base_currency'").run(data.code.toUpperCase());
        }
      }
      const fields: string[] = [];
      const values: any[] = [];
      if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code.toUpperCase()); }
      if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
      if (data.symbol !== undefined) { fields.push('symbol = ?'); values.push(data.symbol); }
      if (data.exchange_rate !== undefined) { fields.push('exchange_rate = ?'); values.push(data.exchange_rate); }
      if (data.is_base !== undefined) { fields.push('is_base = ?'); values.push(data.is_base ? 1 : 0); }
      if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }
      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE currencies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    });
    trx();
    this.cache = null;
  }

  async updateCurrencyByCode(code: string, exchangeRate: number): Promise<void> {
    const db = this.getDb();
    db.prepare('UPDATE currencies SET exchange_rate = ? WHERE code = ?').run(exchangeRate, code.toUpperCase());
    this.cache = null;
  }

  async deleteCurrency(id: number): Promise<void> {
    const db = this.getDb();
    db.prepare('DELETE FROM currencies WHERE id = ?').run(id);
    this.cache = null;
  }

  // ==================== سجل أسعار الصرف التاريخي ====================

  async recordRateHistory(currencyCode: string, rateDate: string, rate: number, source: string, createdBy?: number): Promise<void> {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO exchange_rate_history (currency_code, rate_date, exchange_rate, source, created_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(currency_code, rate_date) DO UPDATE SET
        exchange_rate = excluded.exchange_rate,
        source = excluded.source,
        created_at = CURRENT_TIMESTAMP
    `).run(currencyCode.toUpperCase(), rateDate, rate, source, createdBy || null);
  }

  async getRateForDate(currencyCode: string, date: string): Promise<number | null> {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT exchange_rate FROM exchange_rate_history
      WHERE currency_code = ? AND rate_date <= ?
      ORDER BY rate_date DESC LIMIT 1
    `).get(currencyCode.toUpperCase(), date) as any;
    return row?.exchange_rate ?? null;
  }

  async getRateHistory(currencyCode: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const db = this.getDb();
    let query = 'SELECT * FROM exchange_rate_history WHERE currency_code = ?';
    const params: any[] = [currencyCode.toUpperCase()];
    if (fromDate) { query += ' AND rate_date >= ?'; params.push(fromDate); }
    if (toDate) { query += ' AND rate_date <= ?'; params.push(toDate); }
    query += ' ORDER BY rate_date DESC LIMIT 365';
    return db.prepare(query).all(...params);
  }

  /**
   * حساب فروق العملة عند التسوية (تحصيل/سداد)
   * originalRate: السعر عند إنشاء الفاتورة
   * settlementRate: السعر وقت التحصيل الفعلي
   * amountForeign: المبلغ بالعملة الأجنبية
   */
  calculateExchangeGainLoss(
    amountForeign: number,
    originalRate: number,
    settlementRate: number
  ): { type: 'gain' | 'loss' | 'none'; baseAmount: number; difference: number } {
    const originalBase = amountForeign * originalRate;
    const settlementBase = amountForeign * settlementRate;
    const difference = Math.round((settlementBase - originalBase) * 1000) / 1000;

    if (Math.abs(difference) < 0.005 || settlementRate === originalRate) {
      return { type: 'none', baseAmount: originalBase, difference: 0 };
    }
    return {
      type: difference > 0 ? 'gain' : 'loss',
      baseAmount: settlementBase,
      difference: Math.abs(difference),
    };
  }

  /**
   * تسجيل فرق عملة في قاعدة البيانات
   * القيد المحاسبي الكامل (جانبا الربح/الخسارة والطرف المقابل) يُبنى في نقطة الاستدعاء
   */
  async recordGainLoss(params: {
    type: 'gain' | 'loss';
    amount: number;
    currencyCode: string;
    originalRate: number;
    settlementRate: number;
    referenceType?: string;
    referenceId?: number;
    description?: string;
    createdBy?: number;
  }): Promise<number> {
    const db = this.getDb();
    const result = db.prepare(`
      INSERT INTO currency_gains_losses
      (entry_type, amount, currency_code, original_rate, settlement_rate, reference_type, reference_id, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.type, params.amount, params.currencyCode.toUpperCase(),
      params.originalRate, params.settlementRate,
      params.referenceType || null, params.referenceId || null,
      params.description || null, params.createdBy || null
    );
    return result.lastInsertRowid as number;
  }

  async getGainsLossesSummary(fromDate?: string, toDate?: string): Promise<{ totalGain: number; totalLoss: number; net: number }> {
    const db = this.getDb();
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (fromDate) { where += ' AND created_at >= ?'; params.push(fromDate); }
    if (toDate) { where += ' AND created_at <= ?'; params.push(toDate + ' 23:59:59'); }

    const gains = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM currency_gains_losses ${where} AND entry_type = 'gain'`).get(...params) as any;
    const losses = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM currency_gains_losses ${where} AND entry_type = 'loss'`).get(...params) as any;

    return {
      totalGain: gains?.total || 0,
      totalLoss: losses?.total || 0,
      net: (gains?.total || 0) - (losses?.total || 0),
    };
  }

  clearCache(): void {
    this.cache = null;
  }
}

export const currencyService = CurrencyService.getInstance();