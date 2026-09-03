-- ============================================
-- النظام المحاسبي المتكامل - PostgreSQL Schema
-- ============================================

-- Enable UUID extension (optional)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- المستخدمين والصلاحيات
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','manager','accountant','sales_rep','employee')),
  department VARCHAR(50) CHECK(department IN ('admin','sales','accounting','inventory','hr')),
  is_active INTEGER DEFAULT 1,
  profile_image TEXT,
  national_id VARCHAR(50),
  hire_date DATE,
  basic_salary NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- شجرة الحسابات (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  type VARCHAR(20) NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')),
  parent_id INTEGER REFERENCES accounts(id),
  level INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  balance NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- قيود اليومية
CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  entry_number VARCHAR(50) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  is_posted INTEGER DEFAULT 0,
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل قيود اليومية
CREATE TABLE IF NOT EXISTS journal_entry_items (
  id SERIAL PRIMARY KEY,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  description TEXT,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  cost_center_id INTEGER
);

-- العملاء
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  tax_number VARCHAR(100),
  credit_limit NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  sales_rep_id INTEGER REFERENCES users(id),
  classification_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الموردين
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  tax_number VARCHAR(100),
  current_balance NUMERIC(15,2) DEFAULT 0,
  currency_code VARCHAR(10) DEFAULT 'IQD',
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الأصناف (Inventory)
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  category VARCHAR(100),
  unit VARCHAR(50) DEFAULT 'قطعة',
  purchase_price NUMERIC(15,2) DEFAULT 0,
  sale_price NUMERIC(15,2) DEFAULT 0,
  selling_price NUMERIC(15,2) DEFAULT 0,
  current_quantity NUMERIC(15,3) DEFAULT 0,
  min_quantity NUMERIC(15,3) DEFAULT 5,
  max_quantity NUMERIC(15,3) DEFAULT 100,
  barcode VARCHAR(100),
  image TEXT,
  warehouse_id INTEGER,
  location_in_warehouse TEXT,
  expiry_date DATE,
  average_cost NUMERIC(15,2) DEFAULT 0,
  standard_cost NUMERIC(15,2) DEFAULT 0,
  costing_method VARCHAR(20) DEFAULT 'fifo',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فواتير المبيعات
CREATE TABLE IF NOT EXISTS sales_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  sales_rep_id INTEGER REFERENCES users(id),
  subtotal NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  discount_type VARCHAR(20) DEFAULT 'amount' CHECK(discount_type IN ('amount','percentage')),
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  remaining_amount NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK(payment_status IN ('paid','partial','unpaid')),
  payment_method VARCHAR(20) CHECK(payment_method IN ('cash','card','credit','transfer')),
  currency_code VARCHAR(10) DEFAULT 'IQD',
  exchange_rate NUMERIC(15,4) DEFAULT 1,
  notes TEXT,
  location_lat NUMERIC(10,6),
  location_lng NUMERIC(10,6),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل فاتورة المبيعات
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id SERIAL PRIMARY KEY,
  sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  discount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL
);

-- فواتير المشتريات
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  subtotal NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  discount_type VARCHAR(20) DEFAULT 'amount' CHECK(discount_type IN ('amount','percentage')),
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  remaining_amount NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK(payment_status IN ('paid','partial','unpaid')),
  payment_method VARCHAR(20),
  currency_code VARCHAR(10) DEFAULT 'IQD',
  exchange_rate NUMERIC(15,4) DEFAULT 1,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- تفاصيل فاتورة المشتريات
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id SERIAL PRIMARY KEY,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL
);

-- الأطباء
CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  specialization TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  clinic_name TEXT,
  visit_fee NUMERIC(15,2) DEFAULT 0,
  commission_percentage NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- مبيعات الأطباء
CREATE TABLE IF NOT EXISTS doctor_sales (
  id SERIAL PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  commission_amount NUMERIC(15,2) DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الحضور والانصراف
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  check_in_time TIMESTAMP,
  check_out_time TIMESTAMP,
  check_in_location_lat NUMERIC(10,6),
  check_in_location_lng NUMERIC(10,6),
  check_out_location_lat NUMERIC(10,6),
  check_out_location_lng NUMERIC(10,6),
  check_in_photo TEXT,
  check_out_photo TEXT,
  check_in_place_photo TEXT,
  check_out_place_photo TEXT,
  status VARCHAR(20) DEFAULT 'present' CHECK(status IN ('present','absent','late','half_day')),
  late_minutes INTEGER DEFAULT 0,
  work_hours NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الإجازات
CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type VARCHAR(20) CHECK(leave_type IN ('annual','sick','emergency','personal')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- المصروفات
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  account_id INTEGER REFERENCES accounts(id),
  paid_by INTEGER REFERENCES users(id),
  receipt_image TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- التقارير المحفوظة
CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parameters TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- سجل النشاطات
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type VARCHAR(100),
  entity_id INTEGER,
  details TEXT,
  ip_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_jti TEXT NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- محاولات الدخول
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  ip_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- العملات
CREATE TABLE IF NOT EXISTS currencies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  exchange_rate NUMERIC(15,6) DEFAULT 1,
  is_base INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الإعدادات
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- معلومات الشركة
CREATE TABLE IF NOT EXISTS company_info (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  logo TEXT,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  website TEXT,
  tax_number VARCHAR(100),
  commercial_registry TEXT,
  cr_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- النسخ الاحتياطية
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  size_bytes BIGINT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- المستودعات
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  phone VARCHAR(50),
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_items (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) DEFAULT 0,
  min_quantity NUMERIC(15,3) DEFAULT 5,
  max_quantity NUMERIC(15,3) DEFAULT 100,
  UNIQUE(warehouse_id, item_id)
);

-- حركات المخزون
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  movement_type VARCHAR(20) NOT NULL CHECK(movement_type IN ('in','out','transfer_in','transfer_out','adjustment')),
  quantity NUMERIC(15,3) NOT NULL,
  unit_cost NUMERIC(15,2) DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- أسعار الأصناف
CREATE TABLE IF NOT EXISTS item_prices (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  price_type VARCHAR(20) NOT NULL CHECK(price_type IN ('retail','wholesale','premium','contract')),
  price NUMERIC(15,2) NOT NULL,
  min_quantity NUMERIC(15,3) DEFAULT 1,
  client_id INTEGER REFERENCES clients(id),
  is_active INTEGER DEFAULT 1,
  UNIQUE(item_id, price_type)
);

-- عروض الأسعار
CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  quote_date DATE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  sales_rep_id INTEGER REFERENCES users(id),
  subtotal NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  discount_type VARCHAR(20) DEFAULT 'amount' CHECK(discount_type IN ('amount','percentage')),
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','converted')),
  valid_until DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id SERIAL PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  discount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL
);

-- إشعارات الخصم (Credit Notes)
CREATE TABLE IF NOT EXISTS credit_notes (
  id SERIAL PRIMARY KEY,
  credit_note_number VARCHAR(50) UNIQUE NOT NULL,
  credit_note_date DATE NOT NULL,
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  reason TEXT,
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id SERIAL PRIMARY KEY,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL
);

-- أوامر الشراء
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  order_date DATE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  expected_date DATE,
  subtotal NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','approved','received','cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  received_quantity NUMERIC(15,3) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL
);

-- إشعارات المدين (Debit Notes)
CREATE TABLE IF NOT EXISTS debit_notes (
  id SERIAL PRIMARY KEY,
  debit_note_number VARCHAR(50) UNIQUE NOT NULL,
  debit_note_date DATE NOT NULL,
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  reason TEXT,
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debit_note_items (
  id SERIAL PRIMARY KEY,
  debit_note_id INTEGER NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL
);

-- مدفوعات العملاء
CREATE TABLE IF NOT EXISTS client_payments (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  amount NUMERIC(15,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(20) CHECK(payment_method IN ('cash','card','credit','transfer')),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- تصنيفات العملاء
CREATE TABLE IF NOT EXISTS client_classifications (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  credit_limit NUMERIC(15,2) DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- الحسابات البنكية
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  iban VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'IQD',
  opening_balance NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- كشف الحساب البنكي
CREATE TABLE IF NOT EXISTS bank_statements (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  statement_date DATE NOT NULL,
  reference VARCHAR(100),
  description TEXT,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  balance NUMERIC(15,2) DEFAULT 0,
  is_reconciled INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  reconciliation_date DATE NOT NULL,
  bank_statement_id INTEGER REFERENCES bank_statements(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  is_matched INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الأصول الثابتة
CREATE TABLE IF NOT EXISTS fixed_assets (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(100),
  purchase_date DATE NOT NULL,
  purchase_cost NUMERIC(15,2) NOT NULL,
  residual_value NUMERIC(15,2) DEFAULT 0,
  useful_life_years INTEGER NOT NULL,
  depreciation_method VARCHAR(20) DEFAULT 'straight_line' CHECK(depreciation_method IN ('straight_line','declining')),
  depreciation_rate NUMERIC(5,2),
  current_book_value NUMERIC(15,2) NOT NULL,
  accumulated_depreciation NUMERIC(15,2) DEFAULT 0,
  location TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active','disposed','sold')),
  disposal_date DATE,
  disposal_amount NUMERIC(15,2),
  account_id INTEGER REFERENCES accounts(id),
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_depreciation (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id),
  depreciation_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- الميزانيات
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_type VARCHAR(20) DEFAULT 'monthly' CHECK(period_type IN ('monthly','quarterly','yearly')),
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_items (
  id SERIAL PRIMARY KEY,
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  period INTEGER NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  UNIQUE(budget_id, account_id, period)
);

-- عقود الموظفين
CREATE TABLE IF NOT EXISTS employee_contracts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contract_type VARCHAR(20) CHECK(contract_type IN ('full_time','part_time','fixed_term')),
  start_date DATE NOT NULL,
  end_date DATE,
  basic_salary NUMERIC(15,2) DEFAULT 0,
  housing_allowance NUMERIC(15,2) DEFAULT 0,
  transportation_allowance NUMERIC(15,2) DEFAULT 0,
  other_allowances TEXT,
  insurance_deduction NUMERIC(15,2) DEFAULT 0,
  contract_file TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  termination_date DATE,
  termination_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- قروض الموظفين
CREATE TABLE IF NOT EXISTS employee_loans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount NUMERIC(15,2) NOT NULL,
  total_amount NUMERIC(15,2) NOT NULL,
  remaining_amount NUMERIC(15,2) NOT NULL,
  monthly_deduction NUMERIC(15,2) DEFAULT 0,
  start_month VARCHAR(10) NOT NULL,
  end_month VARCHAR(10),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active','paid','cancelled')),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- أرصدة الإجازات
CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type VARCHAR(20) NOT NULL CHECK(leave_type IN ('annual','sick','emergency','personal')),
  total_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,1) DEFAULT 0,
  remaining_days NUMERIC(5,1) DEFAULT 0,
  year INTEGER NOT NULL,
  UNIQUE(user_id, leave_type, year)
);

-- الوردات
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  grace_minutes INTEGER DEFAULT 15,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active INTEGER DEFAULT 1,
  UNIQUE(user_id, start_date)
);

-- مجموعات الصلاحيات
CREATE TABLE IF NOT EXISTS permission_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permission_group_users (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES permission_groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES permission_groups(id),
  resource VARCHAR(100) NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  UNIQUE(group_id, resource)
);

-- الشركات
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  database_path TEXT,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إعدادات البريد الإلكتروني
CREATE TABLE IF NOT EXISTS email_config (
  id SERIAL PRIMARY KEY,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure INTEGER DEFAULT 1,
  smtp_user TEXT,
  smtp_pass TEXT,
  from_name TEXT,
  from_email VARCHAR(255),
  is_active INTEGER DEFAULT 1
);

-- الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT,
  type VARCHAR(20) CHECK(type IN ('info','warning','success','error')),
  reference_type VARCHAR(50),
  reference_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جرد المخزون
CREATE TABLE IF NOT EXISTS inventory_counts (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER REFERENCES warehouses(id),
  count_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','approved')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id SERIAL PRIMARY KEY,
  inventory_count_id INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  system_quantity NUMERIC(15,3) NOT NULL,
  actual_quantity NUMERIC(15,3) NOT NULL,
  difference NUMERIC(15,3) NOT NULL,
  notes TEXT
);

-- مؤشرات الأداء للموظفين
CREATE TABLE IF NOT EXISTS employee_kpis (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  kpi_name TEXT NOT NULL,
  kpi_type VARCHAR(20) NOT NULL DEFAULT 'percentage' CHECK(kpi_type IN ('percentage','number','currency')),
  target_value NUMERIC(15,2) NOT NULL,
  actual_value NUMERIC(15,2) DEFAULT 0,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  evaluation_period VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK(evaluation_period IN ('monthly','quarterly','yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- مراجعات الأداء
CREATE TABLE IF NOT EXISTS performance_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  review_date DATE NOT NULL,
  overall_score NUMERIC(5,2),
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- سجلات الساعات الإضافية
CREATE TABLE IF NOT EXISTS overtime_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  rate_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  amount NUMERIC(15,2) NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- خصومات الحضور
CREATE TABLE IF NOT EXISTS attendance_deductions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- نقاط الولاء
CREATE TABLE IF NOT EXISTS loyalty_points (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  points INTEGER NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  points INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK(type IN ('earn','redeem','expire')),
  reference_type VARCHAR(50),
  reference_id INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- دفعات الأصناف (Item Batches)
CREATE TABLE IF NOT EXISTS item_batches (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch_number VARCHAR(100),
  quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(15,2) DEFAULT 0,
  expiry_date DATE,
  purchase_price NUMERIC(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- خطط التقسيط
CREATE TABLE IF NOT EXISTS installment_plans (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  total_amount NUMERIC(15,2) NOT NULL,
  down_payment NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(15,2) NOT NULL,
  installment_count INTEGER NOT NULL,
  installment_amount NUMERIC(15,2) NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 30,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','defaulted')),
  start_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES installment_plans(id),
  due_date DATE NOT NULL,
  paid_date DATE,
  amount NUMERIC(15,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- مدفوعات الموردين
CREATE TABLE IF NOT EXISTS supplier_payments (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  amount NUMERIC(15,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(20) CHECK(payment_method IN ('cash','card','credit','transfer')),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- مراكز التكلفة
CREATE TABLE IF NOT EXISTS cost_centers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES cost_centers(id),
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- أهداف المبيعات
CREATE TABLE IF NOT EXISTS sales_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  target_amount NUMERIC(15,2) NOT NULL,
  achieved_amount NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month, year)
);

-- سياسات الخصم
CREATE TABLE IF NOT EXISTS discount_policies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK(type IN ('percentage','amount')),
  value NUMERIC(15,2) NOT NULL,
  min_order_amount NUMERIC(15,2) DEFAULT 0,
  client_classification_id INTEGER REFERENCES client_classifications(id),
  is_active INTEGER DEFAULT 1,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- سجل تاريخ أسعار الصرف
CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(10) NOT NULL,
  rate NUMERIC(15,6) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- أرصدة ائتمانية للعملاء
CREATE TABLE IF NOT EXISTS client_credits (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  amount NUMERIC(15,2) NOT NULL,
  used_amount NUMERIC(15,2) DEFAULT 0,
  source VARCHAR(50),
  reference_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- توزيع المدفوعات
CREATE TABLE IF NOT EXISTS payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES client_payments(id),
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
CREATE INDEX IF NOT EXISTS idx_warehouse_items_item ON warehouse_items(item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_warehouse ON warehouse_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON credit_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_entry ON journal_entry_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_user ON employee_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_item ON item_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_expiry ON item_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_installment_plans_client ON installment_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_client ON loyalty_points(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_client_date ON sales_invoices(client_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_code ON exchange_rate_history(currency_code, recorded_at);

-- ============================================
-- البيانات الافتراضية
-- ============================================

-- شجرة الحسابات
INSERT INTO accounts (code, name, type, level) VALUES
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
('5.8', 'مصروفات تسويق', 'expense', 1)
ON CONFLICT (code) DO NOTHING;

-- المستخدم الافتراضي (admin / 123456)
INSERT INTO users (username, password_hash, full_name, email, phone, role, department)
VALUES ('admin', '$2a$10$Ket5S6iwOLX3ILYD.o9hMeUveyVSfFMErNeost7dTbe5KUo0ovVtm', 'مدير النظام', 'admin@system.com', '07700000000', 'admin', 'admin')
ON CONFLICT (username) DO NOTHING;

-- العملات الافتراضية (IQD كعملة أساسية)
INSERT INTO currencies (code, name, symbol, exchange_rate, is_base) VALUES
('IQD', 'دينار عراقي', 'د.ع', 1, 1),
('USD', 'دولار أمريكي', '$', 1450, 0),
('EUR', 'يورو', '€', 1580, 0),
('GBP', 'جنيه إسترليني', '£', 1840, 0),
('SAR', 'ريال سعودي', 'ر.س', 385, 0),
('AED', 'درهم إماراتي', 'د.إ', 395, 0),
('KWD', 'دينار كويتي', 'د.ك', 4700, 0),
('QAR', 'ريال قطري', 'ر.ق', 398, 0),
('BHD', 'دينار بحريني', 'د.ب', 3850, 0),
('OMR', 'ريال عماني', 'ر.ع', 3770, 0)
ON CONFLICT (code) DO NOTHING;

-- الإعدادات الافتراضية
INSERT INTO settings (setting_key, setting_value) VALUES
('company_name', 'شركتي'),
('company_name_en', 'My Company'),
('company_tax_number', ''),
('company_commercial_registry', ''),
('company_phone', ''),
('company_email', ''),
('company_address', ''),
('default_currency', 'IQD'),
('date_format', 'YYYY-MM-DD'),
('language', 'ar'),
('timezone', 'Asia/Baghdad')
ON CONFLICT (setting_key) DO NOTHING;
