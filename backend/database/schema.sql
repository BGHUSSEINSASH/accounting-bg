-- ============================================
-- النظام المحاسبي المتكامل - قاعدة البيانات
-- ============================================

-- المستخدمين والصلاحيات
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','manager','accountant','sales_rep','employee')),
  department TEXT CHECK(department IN ('admin','sales','accounting','inventory','hr')),
  is_active INTEGER DEFAULT 1,
  profile_image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- شجرة الحسابات (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')),
  parent_id INTEGER REFERENCES accounts(id),
  level INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  balance REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- قيود اليومية
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type TEXT CHECK(reference_type IN ('sale','purchase','expense','transfer','opening')),
  reference_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  is_posted INTEGER DEFAULT 0,
  posted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل قيود اليومية
CREATE TABLE IF NOT EXISTS journal_entry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  description TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  cost_center_id INTEGER
);

-- العملاء
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  tax_number TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  notes TEXT,
  sales_rep_id INTEGER REFERENCES users(id),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- الموردين
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tax_number TEXT,
  current_balance REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- الأصناف (Inventory)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  category TEXT,
  unit TEXT DEFAULT 'قطعة',
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  current_quantity REAL DEFAULT 0,
  min_quantity REAL DEFAULT 5,
  max_quantity REAL DEFAULT 100,
  barcode TEXT,
  image TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- فواتير المبيعات
CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  sales_rep_id INTEGER REFERENCES users(id),
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  remaining_amount REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('paid','partial','unpaid')),
  payment_method TEXT CHECK(payment_method IN ('cash','card','credit','transfer')),
  notes TEXT,
  location_lat REAL,
  location_lng REAL,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل فاتورة المبيعات
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL DEFAULT 0,
  total REAL NOT NULL
);

-- فواتير المشتريات
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('paid','partial','unpaid')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل فاتورة المشتريات
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

-- الأطباء
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  clinic_name TEXT,
  visit_fee REAL DEFAULT 0,
  commission_percentage REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- مبيعات الأطباء (ربط المبيعات بالأطباء)
CREATE TABLE IF NOT EXISTS doctor_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  commission_amount REAL DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- الحضور والانصراف
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  check_in_time DATETIME,
  check_out_time DATETIME,
  check_in_location_lat REAL,
  check_in_location_lng REAL,
  check_out_location_lat REAL,
  check_out_location_lng REAL,
  check_in_photo TEXT,
  check_out_photo TEXT,
  check_in_place_photo TEXT,
  check_out_place_photo TEXT,
  status TEXT DEFAULT 'present' CHECK(status IN ('present','absent','late','half_day')),
  late_minutes INTEGER DEFAULT 0,
  work_hours REAL DEFAULT 0,
  notes TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- الإجازات
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type TEXT CHECK(leave_type IN ('annual','sick','emergency','personal')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- المصروفات
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date DATE NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  account_id INTEGER REFERENCES accounts(id),
  paid_by INTEGER REFERENCES users(id),
  receipt_image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- التقارير المحفوظة
CREATE TABLE IF NOT EXISTS saved_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parameters TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- سجل النشاطات
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- النسخ الاحتياطي
-- تنظيف النص
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_jti TEXT NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- تنظيف النص
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تنظيف النص
CREATE TABLE IF NOT EXISTS currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange_rate REAL DEFAULT 1,
  is_base INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تنظيف النص
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- تنظيف النص
CREATE TABLE IF NOT EXISTS company_info (
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
);

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size_bytes INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--                 
-- ============================================
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL DEFAULT 0,
  min_quantity REAL DEFAULT 5,
  max_quantity REAL DEFAULT 100,
  UNIQUE(warehouse_id, item_id)
);

--              
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  movement_type TEXT NOT NULL CHECK(movement_type IN ('in','out','transfer_in','transfer_out','adjustment')),
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--                             
-- ============================================
CREATE TABLE IF NOT EXISTS item_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  price_type TEXT NOT NULL CHECK(price_type IN ('retail','wholesale','premium','contract')),
  price REAL NOT NULL,
  min_quantity REAL DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  UNIQUE(item_id, price_type)
);

-- ============================================
--              (Quotations)
-- ============================================
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT UNIQUE NOT NULL,
  quote_date DATE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  sales_rep_id INTEGER REFERENCES users(id),
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','converted')),
  valid_until DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL DEFAULT 0,
  total REAL NOT NULL
);

-- ============================================
--                   (                )
-- ============================================
CREATE TABLE IF NOT EXISTS credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_number TEXT UNIQUE NOT NULL,
  credit_note_date DATE NOT NULL,
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  reason TEXT,
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

-- ============================================
--              (Purchase Orders)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  expected_date DATE,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','received','cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  received_quantity REAL DEFAULT 0,
  total REAL NOT NULL
);

-- ============================================
--                   (                 )
-- ============================================
CREATE TABLE IF NOT EXISTS debit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debit_note_number TEXT UNIQUE NOT NULL,
  debit_note_date DATE NOT NULL,
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  reason TEXT,
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debit_note_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debit_note_id INTEGER NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

-- ============================================
--                
-- ============================================
CREATE TABLE IF NOT EXISTS client_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  amount REAL NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('cash','card','credit','transfer')),
  reference_number TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--              
-- ============================================
CREATE TABLE IF NOT EXISTS client_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  discount_percentage REAL DEFAULT 0,
  credit_limit REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- classification_id added via initializeDatabase()

-- ============================================
--                        
-- ============================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  iban TEXT,
  currency TEXT DEFAULT 'SAR',
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--                
-- ============================================
CREATE TABLE IF NOT EXISTS bank_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  statement_date DATE NOT NULL,
  reference TEXT,
  description TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  is_reconciled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  reconciliation_date DATE NOT NULL,
  bank_statement_id INTEGER REFERENCES bank_statements(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  is_matched INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--               
-- ============================================
CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  purchase_date DATE NOT NULL,
  purchase_cost REAL NOT NULL,
  residual_value REAL DEFAULT 0,
  useful_life_years INTEGER NOT NULL,
  depreciation_method TEXT DEFAULT 'straight_line' CHECK(depreciation_method IN ('straight_line','declining')),
  depreciation_rate REAL,
  current_book_value REAL NOT NULL,
  accumulated_depreciation REAL DEFAULT 0,
  location TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','disposed','sold')),
  disposal_date DATE,
  disposal_amount REAL,
  account_id INTEGER REFERENCES accounts(id),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_depreciation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id),
  depreciation_date DATE NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--                    
-- ============================================
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_type TEXT DEFAULT 'monthly' CHECK(period_type IN ('monthly','quarterly','yearly')),
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  period INTEGER NOT NULL,
  amount REAL NOT NULL,
  UNIQUE(budget_id, account_id, period)
);

-- ============================================
--                 -          
-- ============================================
CREATE TABLE IF NOT EXISTS employee_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contract_type TEXT CHECK(contract_type IN ('full_time','part_time','fixed_term')),
  start_date DATE NOT NULL,
  end_date DATE,
  basic_salary REAL DEFAULT 0,
  housing_allowance REAL DEFAULT 0,
  transportation_allowance REAL DEFAULT 0,
  other_allowances TEXT,
  insurance_deduction REAL DEFAULT 0,
  contract_file TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  termination_date DATE,
  termination_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  remaining_amount REAL NOT NULL,
  monthly_deduction REAL DEFAULT 0,
  start_month TEXT NOT NULL,
  end_month TEXT,
  reason TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paid','cancelled')),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type TEXT NOT NULL CHECK(leave_type IN ('annual','sick','emergency','personal')),
  total_days REAL NOT NULL DEFAULT 0,
  used_days REAL DEFAULT 0,
  remaining_days REAL DEFAULT 0,
  year INTEGER NOT NULL,
  UNIQUE(user_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grace_minutes INTEGER DEFAULT 15,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active INTEGER DEFAULT 1,
  UNIQUE(user_id, start_date)
);

-- ============================================
--                    
-- ============================================
CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permission_group_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES permission_groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES permission_groups(id),
  resource TEXT NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  UNIQUE(group_id, resource)
);

-- ============================================
--                 
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  database_path TEXT,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--                                     
-- ============================================
CREATE TABLE IF NOT EXISTS email_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure INTEGER DEFAULT 1,
  smtp_user TEXT,
  smtp_pass TEXT,
  from_name TEXT,
  from_email TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT CHECK(type IN ('info','warning','success','error')),
  reference_type TEXT,
  reference_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
--              (Inventory Count)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER REFERENCES warehouses(id),
  count_date DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','approved')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_count_id INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  system_quantity REAL NOT NULL,
  actual_quantity REAL NOT NULL,
  difference REAL NOT NULL,
  notes TEXT
);

-- ============================================
--                
-- ============================================
CREATE INDEX IF NOT EXISTS idx_warehouse_items_item ON warehouse_items(item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_warehouse ON warehouse_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON credit_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_debit_notes_supplier ON debit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_invoice ON client_payments(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_account ON fixed_assets(account_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_account ON budget_items(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_warehouse ON inventory_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_item_prices_item ON item_prices(item_id);

-- ============================================
-- الفهارس
-- ============================================
CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_posted ON journal_entries(is_posted);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_date ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_client ON sales_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_rep ON sales_invoices(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_rep ON clients(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_doctor_sales_doctor ON doctor_sales(doctor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at);

-- تنظيف النص
CREATE INDEX IF NOT EXISTS idx_sales_client_date ON sales_invoices(client_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_account ON journal_entry_items(account_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(username, created_at);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

-- ============================================
-- البيانات الافتراضية - شجرة الحسابات
-- ============================================
INSERT OR IGNORE INTO accounts (code, name, type, level) VALUES
('1', 'الأصول', 'asset', 0),
('1.1', 'الأصول المتداولة', 'asset', 1),
('1.1.1', 'النقدية', 'asset', 2),
('1.1.2', 'البنوك', 'asset', 2),
('1.1.3', 'حسابات العملاء', 'asset', 2),
('1.1.4', 'المخزون', 'asset', 2),
('1.2', 'الأصول الثابتة', 'asset', 1),
('1.2.1', 'الأثاث', 'asset', 2),
('1.2.2', 'المعدات', 'asset', 2),
('2', 'الخصوم', 'liability', 0),
('2.1', 'الخصوم المتداولة', 'liability', 1),
('2.1.1', 'حسابات الموردين', 'liability', 2),
('2.1.2', 'الرواتب المستحقة', 'liability', 2),
('2.1.3', 'الضرائب المستحقة', 'liability', 2),
('3', 'حقوق الملكية', 'equity', 0),
('3.1', 'رأس المال', 'equity', 1),
('3.2', 'الأرباح المحتجزة', 'equity', 1),
('4', 'الإيرادات', 'income', 0),
('4.1', 'إيرادات المبيعات', 'income', 1),
('4.2', 'إيرادات أخرى', 'income', 1),
('5', 'المصروفات', 'expense', 0),
('5.1', 'مصروفات الرواتب', 'expense', 1),
('5.2', 'مصروفات الإيجار', 'expense', 1),
('5.3', 'مصروفات الكهرباء', 'expense', 1),
('5.4', 'مصروفات المياه', 'expense', 1),
('5.5', 'مصروفات الاتصالات', 'expense', 1),
('5.6', 'مصروفات النقل', 'expense', 1),
('5.7', 'مصروفات الصيانة', 'expense', 1),
('5.8', 'مصروفات تسويق', 'expense', 1);

-- المستخدم الافتراضي (admin / admin123)
INSERT OR IGNORE INTO users (username, password_hash, full_name, email, phone, role, department)
VALUES ('admin', '$2a$10$Ket5S6iwOLX3ILYD.o9hMeUveyVSfFMErNeost7dTbe5KUo0ovVtm', 'مدير النظام', 'admin@system.com', '0500000000', 'admin', 'admin');

-- العملات الافتراضية
INSERT OR IGNORE INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES
('SAR', 'ريال سعودي', 'ر.س', 1, 1),
('USD', 'دولار أمريكي', '$', 3.75, 0),
('EUR', 'يورو', '€', 4.05, 0),
('GBP', 'جنيه إسترليني', '£', 4.70, 0),
('AED', 'درهم إماراتي', 'د.إ', 1.02, 0),
('EGP', 'جنيه مصري', 'ج.م', 0.12, 0),
('KWD', 'دينار كويتي', 'د.ك', 12.20, 0),
('QAR', 'ريال قطري', 'ر.ق', 1.03, 0),
('BHD', 'دينار بحريني', 'د.ب', 9.95, 0),
('OMR', 'ريال عماني', 'ر.ع', 9.74, 0),
('IQD', 'دينار عراقي', 'د.ع', 0.0028, 0);

INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES
('company_name', '' ),
('company_name_en', ''),
('company_tax_number', ''),
('company_commercial_registry', ''),
('company_phone', ''),
('company_email', ''),
('company_address', ''),
('default_currency', 'SAR'),
('date_format', 'YYYY-MM-DD'),
('language', 'ar'),
('timezone', 'Asia/Riyadh');

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_item ON sales_invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_item ON purchase_invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_entry ON journal_entry_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_user ON employee_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_user ON employee_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user ON leave_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_user ON shift_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_permission_group_users_group ON permission_group_users(group_id);
CREATE INDEX IF NOT EXISTS idx_permission_group_users_user ON permission_group_users(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_group ON permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON bank_statements(statement_date);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_account ON reconciliation_items(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_statement ON reconciliation_items(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_entry ON reconciliation_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_asset ON asset_depreciation(asset_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_item ON quotation_items(item_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_note ON credit_note_items(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_item ON credit_note_items(item_id);
CREATE INDEX IF NOT EXISTS idx_debit_note_items_note ON debit_note_items(debit_note_id);
CREATE INDEX IF NOT EXISTS idx_debit_note_items_item ON debit_note_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count ON inventory_count_items(inventory_count_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_item ON inventory_count_items(item_id);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);

-- Employee KPIs
CREATE TABLE IF NOT EXISTS employee_kpis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  kpi_name TEXT NOT NULL,
  kpi_type TEXT NOT NULL DEFAULT 'percentage' CHECK(kpi_type IN ('percentage', 'number', 'currency')),
  target_value REAL NOT NULL,
  actual_value REAL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 1,
  evaluation_period TEXT NOT NULL DEFAULT 'monthly' CHECK(evaluation_period IN ('monthly', 'quarterly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id)
);

-- Employee Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  review_date DATE NOT NULL,
  overall_score REAL,
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'approved')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

-- Overtime Records
CREATE TABLE IF NOT EXISTS overtime_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  hours REAL NOT NULL,
  rate_multiplier REAL NOT NULL DEFAULT 1.5,
  amount REAL NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT 0,
  approved_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Attendance Deductions
CREATE TABLE IF NOT EXISTS attendance_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  deduction_amount REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpis_employee ON employee_kpis(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_records_employee ON overtime_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_records_date ON overtime_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_deductions_employee ON attendance_deductions(employee_id);

-- ============================================
-- Loyalty Points System
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('earn', 'redeem', 'expire')),
  reference_type TEXT,
  reference_id INTEGER,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- ============================================
-- Product Expiry Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS item_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  batch_number TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  expiry_date DATE,
  purchase_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- ============================================
-- Installment Plans
-- ============================================
CREATE TABLE IF NOT EXISTS installment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  total_amount REAL NOT NULL,
  down_payment REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL,
  installment_count INTEGER NOT NULL,
  installment_amount REAL NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'defaulted')),
  start_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue')),
  payment_method TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES installment_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_client ON loyalty_points(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_client ON loyalty_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_item ON item_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_expiry ON item_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_installment_plans_client ON installment_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_invoice ON installment_plans(invoice_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_status ON installment_payments(status);

