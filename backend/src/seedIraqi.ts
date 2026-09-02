import bcrypt from 'bcryptjs';
import { query, queryOne, execute, withTransaction, getPool } from './config/database';

/**
 * بيانات تجريبية عراقية للـ PostgreSQL
 */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function currentMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function seedIraqiData(): Promise<void> {
  const company = await queryOne('SELECT name FROM company_info WHERE id = 1');
  if (company && company.name && company.name !== 'شركتي') {
    console.log('Demo data already exists — skipping seed');
    return;
  }

  console.log('🌱 Seeding Iraqi demo data...');
  const hash = bcrypt.hashSync('123456', 10);

  await withTransaction(async () => {

    // ======== 1. تحديث معلومات الشركة ========
    await execute(
      `UPDATE company_info SET name = $1, name_en = $2, phone = $3, address = $4, tax_number = $5 WHERE id = 1`,
      ['شركة الأمل للتجارة والمقاولات', 'Al-Amal Trading & Contracting Co.', '07701234567', 'شارع أبو نؤاس، حي الأمانة، بغداد', '200-123-456789']
    );

    // ======== 2. المستخدمون ========
    const users = [
      ['admin',    hash, 'أحمد محمد الجبوري',   'ahmed@al-amal.iq',    '07701234567', 'admin',      'admin',      '1985-03-15', '2020-01-01', 2500000],
      ['mohammed', hash, 'محمد علي الشمري',     'mohammed@al-amal.iq', '07801234567', 'manager',    'sales',      '1990-06-20', '2020-06-01', 1800000],
      ['sara',     hash, 'سارة حسين العبادي',   'sara@al-amal.iq',     '07901234567', 'accountant', 'accounting', '1992-11-10', '2021-01-15', 1500000],
      ['ali_sale', hash, 'علي حسين الركابي',    'ali@al-amal.iq',      '07712345678', 'sales_rep',  'sales',      '1993-04-05', '2021-03-01', 1200000],
      ['fatima',   hash, 'فاطمة زيد الكربلائي', 'fatima@al-amal.iq',   '07812345678', 'sales_rep',  'sales',      '1995-08-22', '2022-01-10', 1200000],
      ['hassan',   hash, 'حسن جاسم الموسوي',    'hassan@al-amal.iq',   '07912345678', 'employee',   'inventory',  '1988-01-30', '2021-06-01', 1100000],
    ];
    for (const u of users) {
      await execute(
        `INSERT INTO users (username, password_hash, full_name, email, phone, role, department, is_active, hire_date, basic_salary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9)
         ON CONFLICT (username) DO NOTHING`,
        u
      );
    }

    // ======== 3. تصنيفات العملاء ========
    const classifications = [
      ['عميل مميز', 10, 50000000],
      ['عميل عادي', 5, 20000000],
      ['عميل جملة', 15, 100000000],
    ];
    for (const c of classifications) {
      await execute(
        `INSERT INTO client_classifications (name, discount_percentage, credit_limit, is_active)
         VALUES ($1,$2,$3,1) ON CONFLICT (name) DO NOTHING`,
        c
      );
    }

    // ======== 4. العملاء ========
    const clients = [
      ['CLI00001', 'شركة الرافدين للتوزيع',      '07701111111', 'rafidain@dist.iq',  'شارع الكفاح، بغداد',   'بغداد',  5000000,  0],
      ['CLI00002', 'مجموعة النهرين التجارية',     '07702222222', 'nahrain@trade.iq',  'حي العلاوي، بغداد',    'بغداد',  3000000,  0],
      ['CLI00003', 'متجر الخليج - البصرة',        '07703333333', 'khalij@store.iq',   'شارع العشار، البصرة',  'البصرة', 1500000,  0],
      ['CLI00004', 'شركة أربيل للتجارة',          '07704444444', 'erbil@trade.iq',    'شارع 60 متر، أربيل',   'أربيل',  2000000,  0],
      ['CLI00005', 'مستشفى ابن سينا الأهلي',      '07705555555', 'ibnsina@hosp.iq',   'المنصور، بغداد',        'بغداد',  4000000,  0],
      ['CLI00006', 'صيدلية الشفاء المركزية',      '07706666666', 'shifa@pharm.iq',    'شارع حيفا، بغداد',     'بغداد',  1000000,  0],
      ['CLI00007', 'مدرسة الرواد الأهلية',        '07707777777', 'rawad@school.iq',   'الجادرية، بغداد',       'بغداد',  800000,   0],
      ['CLI00008', 'فندق ميليا بغداد',            '07708888888', 'melia@hotel.iq',    'شارع أبو نؤاس، بغداد', 'بغداد',  6000000,  0],
    ];
    for (const c of clients) {
      await execute(
        `INSERT INTO clients (code, name, phone, email, address, city, credit_limit, current_balance, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT (code) DO NOTHING`,
        c
      );
    }

    // ======== 5. الموردين ========
    const suppliers = [
      ['SUP00001', 'مصنع الوطنية للأدوية',       '07711111111', 'watania@pharma.iq',  'المدينة الصناعية، بغداد', 'بغداد',  0],
      ['SUP00002', 'شركة المشرق للمستلزمات',      '07722222222', 'mashriq@supply.iq',  'شارع الصناعة، الموصل',   'الموصل', 0],
      ['SUP00003', 'مجموعة الخليج للاستيراد',     '07733333333', 'gulf@import.iq',     'ميناء أم قصر، البصرة',   'البصرة', 0],
      ['SUP00004', 'شركة بغداد للتقنية',          '07744444444', 'baghdad@tech.iq',    'حي الكرادة، بغداد',      'بغداد',  0],
    ];
    for (const s of suppliers) {
      await execute(
        `INSERT INTO suppliers (code, name, phone, email, address, city, current_balance, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1) ON CONFLICT (code) DO NOTHING`,
        s
      );
    }

    // ======== 6. الأصناف ========
    const items = [
      ['ITM00001', 'لابتوب ديل انسبايرون 15',   'Dell Inspiron 15',    'أجهزة',    800000,  950000,  15, 'DL-INS-15001'],
      ['ITM00002', 'طابعة اتش بي LaserJet',      'HP LaserJet Pro',     'طابعات',   350000,  420000,  8,  'HP-LJ-00001'],
      ['ITM00003', 'راوتر واي فاي TP-Link',      'TP-Link Router',      'شبكات',    75000,   95000,   20, 'TP-RT-00001'],
      ['ITM00004', 'شاشة سامسونج 24 بوصة',      'Samsung Monitor 24"', 'شاشات',   250000,  310000,  12, 'SM-MN-24001'],
      ['ITM00005', 'كيبورد ميكانيكي',            'Mechanical Keyboard', 'إكسسوار',  55000,   75000,   25, 'KB-MC-00001'],
      ['ITM00006', 'ماوس لوجيتك لاسلكي',        'Logitech Wireless',   'إكسسوار',  35000,   48000,   30, 'LG-MS-00001'],
      ['ITM00007', 'كاميرا مراقبة داهوا 4MP',   'Dahua IP Camera 4MP', 'أمن',      120000,  160000,  18, 'DH-CM-4M001'],
      ['ITM00008', 'خادم Dell PowerEdge',        'Dell PowerEdge T40',  'خوادم',   2500000, 3200000, 4,  'DL-PE-T4001'],
      ['ITM00009', 'يو بي اس 1000VA',            'UPS 1000VA',          'طاقة',     95000,  125000,  10, 'UP-1K-00001'],
      ['ITM00010', 'كابل شبكة Cat6 (100م)',       'Cat6 Cable 100m',     'شبكات',    45000,   60000,   35, 'CT-C6-100001'],
    ];
    for (const i of items) {
      await execute(
        `INSERT INTO items (code, name, name_en, category, purchase_price, sale_price, selling_price, current_quantity, min_quantity, barcode, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,5,$8,1) ON CONFLICT (code) DO NOTHING`,
        i
      );
    }

    // ======== 7. فواتير المبيعات ========
    // نجلب IDs العملاء والمستخدمين
    const getClient = async (code: string) => (await queryOne('SELECT id FROM clients WHERE code = $1', [code]))?.id;
    const getUser = async (username: string) => (await queryOne('SELECT id FROM users WHERE username = $1', [username]))?.id;
    const getItem = async (code: string) => (await queryOne('SELECT id, sale_price FROM items WHERE code = $1', [code]));

    const clientIds = {
      CLI00001: await getClient('CLI00001'),
      CLI00002: await getClient('CLI00002'),
      CLI00003: await getClient('CLI00003'),
      CLI00004: await getClient('CLI00004'),
      CLI00005: await getClient('CLI00005'),
    };
    const userIds = {
      admin: await getUser('admin'),
      ali: await getUser('ali_sale'),
      fatima: await getUser('fatima'),
      mohammed: await getUser('mohammed'),
    };

    const invoices = [
      // [inv_num, date, client_key, rep_key, items: [{item_code, qty, price}], discount, tax_pct, paid]
      {
        num: 'INV00001', date: daysAgo(30), clientKey: 'CLI00001', repKey: 'ali',
        items: [{code: 'ITM00001', qty: 2, price: 950000}, {code: 'ITM00004', qty: 3, price: 310000}],
        discount: 100000, taxPct: 0, paid: 2700000
      },
      {
        num: 'INV00002', date: daysAgo(25), clientKey: 'CLI00002', repKey: 'fatima',
        items: [{code: 'ITM00002', qty: 3, price: 420000}, {code: 'ITM00005', qty: 5, price: 75000}],
        discount: 0, taxPct: 0, paid: 1635000
      },
      {
        num: 'INV00003', date: daysAgo(20), clientKey: 'CLI00003', repKey: 'ali',
        items: [{code: 'ITM00003', qty: 10, price: 95000}, {code: 'ITM00006', qty: 10, price: 48000}],
        discount: 50000, taxPct: 0, paid: 1380000
      },
      {
        num: 'INV00004', date: daysAgo(15), clientKey: 'CLI00001', repKey: 'ali',
        items: [{code: 'ITM00007', qty: 5, price: 160000}, {code: 'ITM00009', qty: 4, price: 125000}],
        discount: 0, taxPct: 0, paid: 500000
      },
      {
        num: 'INV00005', date: daysAgo(10), clientKey: 'CLI00004', repKey: 'fatima',
        items: [{code: 'ITM00008', qty: 1, price: 3200000}],
        discount: 0, taxPct: 0, paid: 3200000
      },
      {
        num: 'INV00006', date: daysAgo(7), clientKey: 'CLI00002', repKey: 'mohammed',
        items: [{code: 'ITM00001', qty: 5, price: 950000}, {code: 'ITM00002', qty: 2, price: 420000}],
        discount: 200000, taxPct: 0, paid: 5390000
      },
      {
        num: 'INV00007', date: daysAgo(5), clientKey: 'CLI00005', repKey: 'ali',
        items: [{code: 'ITM00007', qty: 8, price: 160000}, {code: 'ITM00009', qty: 8, price: 125000}],
        discount: 100000, taxPct: 0, paid: 2000000
      },
      {
        num: 'INV00008', date: daysAgo(3), clientKey: 'CLI00001', repKey: 'ali',
        items: [{code: 'ITM00010', qty: 20, price: 60000}, {code: 'ITM00003', qty: 5, price: 95000}],
        discount: 0, taxPct: 0, paid: 1675000
      },
      {
        num: 'INV00009', date: daysAgo(1), clientKey: 'CLI00003', repKey: 'fatima',
        items: [{code: 'ITM00004', qty: 4, price: 310000}],
        discount: 0, taxPct: 0, paid: 0
      },
      {
        num: 'INV00010', date: daysAgo(0), clientKey: 'CLI00002', repKey: 'mohammed',
        items: [{code: 'ITM00001', qty: 1, price: 950000}, {code: 'ITM00005', qty: 3, price: 75000}],
        discount: 0, taxPct: 0, paid: 0
      },
    ];

    for (const inv of invoices) {
      const subtotal = inv.items.reduce((s, i) => s + i.qty * i.price, 0);
      const tax = Math.round(subtotal * inv.taxPct / 100);
      const total = subtotal - inv.discount + tax;
      const remaining = total - inv.paid;
      const status = inv.paid >= total ? 'paid' : inv.paid > 0 ? 'partial' : 'unpaid';

      const res = await execute(
        `INSERT INTO sales_invoices (invoice_number, invoice_date, client_id, sales_rep_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, payment_method, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'cash',$12) ON CONFLICT (invoice_number) DO NOTHING`,
        [inv.num, inv.date, clientIds[inv.clientKey as keyof typeof clientIds], userIds[inv.repKey as keyof typeof userIds],
         subtotal, inv.discount, tax, total, inv.paid, remaining, status, userIds.admin]
      );

      if (res.id) {
        for (const item of inv.items) {
          const itemRow = await getItem(item.code);
          if (itemRow) {
            await execute(
              `INSERT INTO sales_invoice_items (sales_invoice_id, item_id, quantity, unit_price, total)
               VALUES ($1,$2,$3,$4,$5)`,
              [res.id, itemRow.id, item.qty, item.price, item.qty * item.price]
            );
          }
        }
      }
    }

    // ======== 8. فواتير المشتريات ========
    const getSupplier = async (code: string) => (await queryOne('SELECT id FROM suppliers WHERE code = $1', [code]))?.id;
    const supIds = {
      SUP00001: await getSupplier('SUP00001'),
      SUP00002: await getSupplier('SUP00002'),
      SUP00003: await getSupplier('SUP00003'),
    };

    const purchases = [
      {
        num: 'PUR00001', date: daysAgo(45), supKey: 'SUP00003',
        items: [{code: 'ITM00001', qty: 10, price: 800000}, {code: 'ITM00004', qty: 15, price: 250000}],
        discount: 500000
      },
      {
        num: 'PUR00002', date: daysAgo(35), supKey: 'SUP00002',
        items: [{code: 'ITM00002', qty: 8, price: 350000}, {code: 'ITM00005', qty: 20, price: 55000}],
        discount: 0
      },
      {
        num: 'PUR00003', date: daysAgo(20), supKey: 'SUP00001',
        items: [{code: 'ITM00007', qty: 20, price: 120000}, {code: 'ITM00009', qty: 15, price: 95000}],
        discount: 200000
      },
    ];

    for (const pur of purchases) {
      const subtotal = pur.items.reduce((s, i) => s + i.qty * i.price, 0);
      const total = subtotal - pur.discount;

      const res = await execute(
        `INSERT INTO purchase_invoices (invoice_number, invoice_date, supplier_id, subtotal, discount, tax, total, paid_amount, remaining_amount, payment_status, created_by)
         VALUES ($1,$2,$3,$4,$5,0,$6,$6,0,'paid',$7) ON CONFLICT (invoice_number) DO NOTHING`,
        [pur.num, pur.date, supIds[pur.supKey as keyof typeof supIds], subtotal, pur.discount, total, userIds.admin]
      );

      if (res.id) {
        for (const item of pur.items) {
          const itemRow = await getItem(item.code);
          if (itemRow) {
            await execute(
              `INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, unit_price, total)
               VALUES ($1,$2,$3,$4,$5)`,
              [res.id, itemRow.id, item.qty, item.price, item.qty * item.price]
            );

            // Insert item_batch for FIFO costing
            const batchNum = `BATCH-${pur.num}-${item.code}`;
            await execute(
              `INSERT INTO item_batches (item_id, batch_number, quantity, unit_cost, purchase_price)
               VALUES ($1, $2, $3, $4, $4)
               ON CONFLICT DO NOTHING`,
              [itemRow.id, batchNum, item.qty, item.price]
            );
          }
        }
      }
    }

    // ======== 9. مدفوعات العملاء ========
    const salesInvoice = async (num: string) => (await queryOne('SELECT id, client_id FROM sales_invoices WHERE invoice_number = $1', [num]));

    const payments = [
      { inv: 'INV00001', amount: 2700000, date: daysAgo(28) },
      { inv: 'INV00002', amount: 1635000, date: daysAgo(23) },
      { inv: 'INV00003', amount: 1380000, date: daysAgo(18) },
      { inv: 'INV00004', amount: 500000,  date: daysAgo(12) },
      { inv: 'INV00005', amount: 3200000, date: daysAgo(9)  },
      { inv: 'INV00006', amount: 5390000, date: daysAgo(6)  },
      { inv: 'INV00007', amount: 2000000, date: daysAgo(4)  },
      { inv: 'INV00008', amount: 1675000, date: daysAgo(2)  },
    ];

    for (const p of payments) {
      const inv = await salesInvoice(p.inv);
      if (inv) {
        await execute(
          `INSERT INTO client_payments (client_id, sales_invoice_id, amount, payment_date, payment_method, created_by)
           VALUES ($1,$2,$3,$4,'cash',$5)`,
          [inv.client_id, inv.id, p.amount, p.date, userIds.admin]
        );
      }
    }

    // ======== 10. أرصدة العملاء — تحديث ========
    await execute(`UPDATE clients SET current_balance = 1300000 WHERE code = 'CLI00001'`, []);
    await execute(`UPDATE clients SET current_balance = 1225000 WHERE code = 'CLI00002'`, []);
    await execute(`UPDATE clients SET current_balance = 1240000 WHERE code = 'CLI00003'`, []);
    await execute(`UPDATE clients SET current_balance = 0       WHERE code = 'CLI00004'`, []);
    await execute(`UPDATE clients SET current_balance = 980000  WHERE code = 'CLI00005'`, []);

    // ======== 11. المصروفات ========
    const expenses = [
      [daysAgo(28), 'إيجار',        'إيجار مكتب الفرع الرئيسي - بغداد شهر ' + new Date().toLocaleString('ar', {month: 'long'}), 2500000],
      [daysAgo(25), 'رواتب',        'رواتب موظفي الشركة للشهر الماضي',                                                         12000000],
      [daysAgo(20), 'كهرباء',       'فاتورة الكهرباء لشهر ' + new Date().toLocaleString('ar', {month: 'long'}),                 350000],
      [daysAgo(15), 'مواصلات',      'مصروف النقل والتوصيل الداخلي',                                                             180000],
      [daysAgo(10), 'صيانة',        'صيانة الأجهزة والمعدات المكتبية',                                                          250000],
      [daysAgo(7),  'مكتبية',       'قرطاسية ومستلزمات مكتبية',                                                                  85000],
      [daysAgo(5),  'اتصالات',      'فاتورة الإنترنت والاتصالات',                                                               120000],
      [daysAgo(3),  'تسويق',        'إعلانات وتسويق عبر الإنترنت',                                                              500000],
      [daysAgo(1),  'ضيافة',        'ضيافة للاجتماعات والضيوف',                                                                  75000],
    ];

    for (const e of expenses) {
      await execute(
        `INSERT INTO expenses (expense_date, category, description, amount, paid_by, status)
         VALUES ($1,$2,$3,$4,$5,'approved')`,
        [e[0], e[1], e[2], e[3], userIds.admin]
      );
    }

    // ======== 12. الحضور ========
    const attendUsers = await query('SELECT id FROM users WHERE is_active = 1 LIMIT 6');
    for (let day = 14; day >= 1; day--) {
      for (const u of attendUsers) {
        const d = daysAgo(day);
        const dayOfWeek = new Date(d).getDay();
        if (dayOfWeek === 5 || dayOfWeek === 6) continue; // جمعة وسبت
        const isLate = Math.random() < 0.1;
        const checkIn = isLate ? `${d}T09:20:00` : `${d}T08:55:00`;
        const checkOut = `${d}T17:05:00`;
        await execute(
          `INSERT INTO attendance (user_id, date, check_in_time, check_out_time, status, late_minutes, work_hours)
           VALUES ($1,$2,$3,$4,$5,$6,8.0) ON CONFLICT DO NOTHING`,
          [u.id, d, checkIn, checkOut, isLate ? 'late' : 'present', isLate ? 20 : 0]
        );
      }
    }

    // ======== 13. إعدادات الشركة ========
    const settingsUpdates = [
      ['company_name', 'شركة الأمل للتجارة والمقاولات'],
      ['company_name_en', 'Al-Amal Trading & Contracting Co.'],
      ['company_phone', '07701234567'],
      ['company_email', 'info@al-amal.iq'],
      ['company_address', 'شارع أبو نؤاس، حي الأمانة، بغداد، العراق'],
      ['default_currency', 'IQD'],
      ['language', 'ar'],
      ['vat_enabled', '0'],
      ['vat_percentage', '0'],
    ];
    for (const [k, v] of settingsUpdates) {
      await execute(
        `INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [k, v]
      );
    }

    // ======== 14. أهداف المبيعات ========
    const { month, year } = currentMonth();
    const salesReps = await query("SELECT id FROM users WHERE role = 'sales_rep' OR role = 'manager'");
    for (const rep of salesReps) {
      await execute(
        `INSERT INTO sales_targets (user_id, month, year, target_amount)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, month, year) DO NOTHING`,
        [rep.id, month, year, 15000000]
      );
    }

  }); // end transaction

  console.log('✅ Iraqi demo data seeded successfully');
}

// Run if executed directly
if (require.main === module) {
  seedIraqiData()
    .then(() => { console.log('Done'); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
