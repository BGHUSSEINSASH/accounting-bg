import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'accounting.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return cols.some((c: any) => c.name === column);
}

function tableExists(database: Database.Database, table: string): boolean {
  const result = database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  return !!result;
}

function safeAlter(database: Database.Database, table: string, column: string, definition: string): void {
  if (tableExists(database, table) && !columnExists(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initializeDatabase(): void {
  const database = getDatabase();
  const schemaPath = path.join(__dirname, '..', '..', '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);

  // ======== MIGRATIONS - إضافة الأعمدة الناقصة ========

  // clients
  safeAlter(database, 'clients', 'classification_id', 'INTEGER REFERENCES client_classifications(id)');

  // purchase_invoices
  safeAlter(database, 'purchase_invoices', 'paid_amount', 'REAL DEFAULT 0');
  safeAlter(database, 'purchase_invoices', 'remaining_amount', 'REAL DEFAULT 0');
  safeAlter(database, 'purchase_invoices', 'payment_method', 'TEXT');

  // attendance
  safeAlter(database, 'attendance', 'early_minutes', 'INTEGER DEFAULT 0');
  safeAlter(database, 'attendance', 'early_checkout', 'INTEGER DEFAULT 0');
  safeAlter(database, 'attendance', 'check_in_place_photo', 'TEXT');
  safeAlter(database, 'attendance', 'check_out_location_lat', 'REAL');
  safeAlter(database, 'attendance', 'check_out_location_lng', 'REAL');
  safeAlter(database, 'attendance', 'check_out_photo', 'TEXT');
  safeAlter(database, 'attendance', 'check_out_place_photo', 'TEXT');
  safeAlter(database, 'attendance', 'check_out_time', 'TEXT');
  safeAlter(database, 'attendance', 'work_hours', 'REAL DEFAULT 0');
  safeAlter(database, 'attendance', 'overtime_hours', 'REAL DEFAULT 0');
  safeAlter(database, 'attendance', 'late_minutes', 'INTEGER DEFAULT 0');
  safeAlter(database, 'attendance', 'status', 'TEXT DEFAULT "present"');
  safeAlter(database, 'attendance', 'notes', 'TEXT');
  safeAlter(database, 'attendance', 'check_in_location_lat', 'REAL');
  safeAlter(database, 'attendance', 'check_in_location_lng', 'REAL');
  safeAlter(database, 'attendance', 'check_in_photo', 'TEXT');

  // expenses - أعمدة الموافقة
  safeAlter(database, 'expenses', 'status', "TEXT DEFAULT 'pending'");
  safeAlter(database, 'expenses', 'approved_by', 'INTEGER REFERENCES users(id)');
  safeAlter(database, 'expenses', 'approved_at', 'DATETIME');
  safeAlter(database, 'expenses', 'rejection_reason', 'TEXT');

  // items - أعمدة إضافية
  safeAlter(database, 'items', 'expiry_date', 'DATE');
  safeAlter(database, 'items', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');
  safeAlter(database, 'items', 'location_in_warehouse', 'TEXT');

  // item_batches - جدول الدفعات
  if (!tableExists(database, 'item_batches')) {
    database.exec(`CREATE TABLE IF NOT EXISTS item_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      batch_number TEXT NOT NULL,
      quantity REAL NOT NULL,
      expiry_date DATE,
      purchase_price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // loyalty_points
  if (!tableExists(database, 'loyalty_points')) {
    database.exec(`CREATE TABLE IF NOT EXISTS loyalty_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id)
    )`);
  }

  // loyalty_transactions
  if (!tableExists(database, 'loyalty_transactions')) {
    database.exec(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('earn','redeem')),
      points INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // installment_plans
  if (!tableExists(database, 'installment_plans')) {
    database.exec(`CREATE TABLE IF NOT EXISTS installment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      sales_invoice_id INTEGER REFERENCES sales_invoices(id),
      total_amount REAL NOT NULL,
      down_payment REAL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      installment_count INTEGER NOT NULL,
      monthly_amount REAL NOT NULL,
      start_date DATE NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // installment_payments
  if (!tableExists(database, 'installment_payments')) {
    database.exec(`CREATE TABLE IF NOT EXISTS installment_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES installment_plans(id),
      due_date DATE NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      payment_date DATE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
      notes TEXT
    )`);
  }

  // sales_invoices - أعمدة إضافية
  safeAlter(database, 'sales_invoices', 'doctor_id', 'INTEGER REFERENCES doctors(id)');
  safeAlter(database, 'sales_invoices', 'payment_method', "TEXT CHECK(payment_method IN ('cash','card','credit','transfer'))");
  safeAlter(database, 'sales_invoices', 'card_number', 'TEXT');
  safeAlter(database, 'sales_invoices', 'cardholder_name', 'TEXT');
  safeAlter(database, 'sales_invoices', 'transfer_reference', 'TEXT');

  // users - أعمدة إضافية للموظفين
  safeAlter(database, 'users', 'national_id', 'TEXT');
  safeAlter(database, 'users', 'nationality', 'TEXT');
  safeAlter(database, 'users', 'birth_date', 'DATE');
  safeAlter(database, 'users', 'hire_date', 'DATE');
  safeAlter(database, 'users', 'basic_salary', 'REAL DEFAULT 0');
  safeAlter(database, 'users', 'housing_allowance', 'REAL DEFAULT 0');
  safeAlter(database, 'users', 'transportation_allowance', 'REAL DEFAULT 0');
  safeAlter(database, 'users', 'position', 'TEXT');
  safeAlter(database, 'users', 'manager_id', 'INTEGER REFERENCES users(id)');
  safeAlter(database, 'users', 'address', 'TEXT');
  safeAlter(database, 'users', 'iban', 'TEXT');
  safeAlter(database, 'users', 'bank_name', 'TEXT');

  // leaves - أعمدة إضافية
  safeAlter(database, 'leaves', 'approved_by', 'INTEGER REFERENCES users(id)');
  safeAlter(database, 'leaves', 'approved_at', 'DATETIME');
  safeAlter(database, 'leaves', 'rejection_reason', 'TEXT');

  // payroll
  if (!tableExists(database, 'payroll')) {
    database.exec(`CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      basic_salary REAL DEFAULT 0,
      housing_allowance REAL DEFAULT 0,
      transportation_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      overtime_amount REAL DEFAULT 0,
      gross_salary REAL DEFAULT 0,
      social_insurance REAL DEFAULT 0,
      tax_deduction REAL DEFAULT 0,
      loan_deduction REAL DEFAULT 0,
      absence_deduction REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','approved','paid')),
      payment_date DATE,
      payment_method TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, month, year)
    )`);
  }

  // doctor_sales - أعمدة إضافية
  safeAlter(database, 'doctor_sales', 'commission_amount', 'REAL DEFAULT 0');
  safeAlter(database, 'doctor_sales', 'visit_date', 'DATE');
  safeAlter(database, 'doctor_sales', 'notes', 'TEXT');
  safeAlter(database, 'doctor_sales', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

  // بيانات الشركة الافتراضية
  if (!tableExists(database, 'company_info')) {
    database.exec(`CREATE TABLE IF NOT EXISTS company_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT,
      logo TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      tax_number TEXT,
      commercial_registry TEXT,
      cr_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
  database.prepare("INSERT OR IGNORE INTO company_info (id, name) VALUES (1, 'شركتي')").run();

  // ======= جداول جديدة - الميزات المتقدمة =======

  // أهداف المبيعات
  if (!tableExists(database, 'sales_targets')) {
    database.exec(`CREATE TABLE IF NOT EXISTS sales_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      period_type TEXT NOT NULL DEFAULT 'monthly' CHECK(period_type IN ('monthly','quarterly','yearly')),
      month INTEGER,
      quarter INTEGER,
      year INTEGER NOT NULL,
      target_amount REAL NOT NULL DEFAULT 0,
      target_count INTEGER DEFAULT 0,
      achieved_amount REAL DEFAULT 0,
      achieved_count INTEGER DEFAULT 0,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, period_type, month, quarter, year)
    )`);
  }

  // قواعد العمولات
  if (!tableExists(database, 'commission_rules')) {
    database.exec(`CREATE TABLE IF NOT EXISTS commission_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      rule_type TEXT NOT NULL DEFAULT 'percentage' CHECK(rule_type IN ('percentage','fixed','tiered')),
      percentage REAL DEFAULT 0,
      fixed_amount REAL DEFAULT 0,
      min_sales REAL DEFAULT 0,
      max_sales REAL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // سجل العمولات
  if (!tableExists(database, 'commissions')) {
    database.exec(`CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      sales_invoice_id INTEGER REFERENCES sales_invoices(id),
      amount REAL NOT NULL,
      percentage REAL DEFAULT 0,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid')),
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // تحويلات المخزون
  if (!tableExists(database, 'inventory_transfers')) {
    database.exec(`CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_number TEXT UNIQUE NOT NULL,
      transfer_date DATE NOT NULL,
      from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  if (!tableExists(database, 'inventory_transfer_items')) {
    database.exec(`CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL,
      notes TEXT
    )`);
  }

  // مراكز التكلفة
  if (!tableExists(database, 'cost_centers')) {
    database.exec(`CREATE TABLE IF NOT EXISTS cost_centers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES cost_centers(id),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // سياسات الخصم
  if (!tableExists(database, 'discount_policies')) {
    database.exec(`CREATE TABLE IF NOT EXISTS discount_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      policy_type TEXT NOT NULL CHECK(policy_type IN ('quantity','client_type','period','total')),
      client_classification_id INTEGER REFERENCES client_classifications(id),
      min_quantity REAL DEFAULT 0,
      min_total REAL DEFAULT 0,
      discount_percentage REAL NOT NULL DEFAULT 0,
      start_date DATE,
      end_date DATE,
      applies_to TEXT DEFAULT 'all',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // إعدادات الضريبة
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('vat_enabled', '0')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('vat_percentage', '15')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('vat_number', '')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('fiscal_year_start', '01-01')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('fiscal_year_end', '12-31')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('auto_backup_enabled', '0')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('auto_backup_interval', 'daily')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('invoice_template', 'default')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('invoice_notes', '')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('low_stock_notify', '1')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('expiry_notify_days', '30')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('currency_symbol', 'ر.س')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('decimal_places', '2')").run();
  database.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('inventory_method', 'fifo')").run();

  // أعمدة إضافية للمبيعات لدعم مراكز التكلفة والعمولة
  safeAlter(database, 'sales_invoices', 'cost_center_id', 'INTEGER REFERENCES cost_centers(id)');
  safeAlter(database, 'expenses', 'cost_center_id', 'INTEGER REFERENCES cost_centers(id)');
  safeAlter(database, 'journal_entry_items', 'cost_center_id', 'INTEGER REFERENCES cost_centers(id)');

  // إضافة عمود طريقة حساب المخزون للأصناف
  safeAlter(database, 'items', 'costing_method', "TEXT DEFAULT 'fifo'");
  safeAlter(database, 'items', 'average_cost', 'REAL DEFAULT 0');
  safeAlter(database, 'items', 'supplier_id', 'INTEGER REFERENCES suppliers(id)');

  console.log('Database initialized successfully');
}
