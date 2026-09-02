export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'accountant' | 'sales_rep' | 'employee';
  department: string;
  is_active: number;
  profile_image?: string;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  name_en?: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parent_id?: number;
  level: number;
  is_active: number;
  balance: number;
}

export interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  is_posted: number;
  items: JournalEntryItem[];
}

export interface JournalEntryItem {
  id: number;
  journal_entry_id: number;
  account_id: number;
  account_name?: string;
  account_code?: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface Client {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  tax_number?: string;
  credit_limit: number;
  current_balance: number;
  sales_rep_id?: number;
  is_active: number;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  tax_number?: string;
  current_balance: number;
  is_active: number;
}

export interface Item {
  id: number;
  code: string;
  name: string;
  name_en?: string;
  category?: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_quantity: number;
  min_quantity: number;
  max_quantity: number;
  barcode?: string;
  is_active: number;
}

export interface SalesInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  client_id?: number;
  client_name?: string;
  client_phone?: string;
  sales_rep_id?: number;
  sales_rep_name?: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  payment_method?: string;
  notes?: string;
  location_lat?: number;
  location_lng?: number;
  items: SalesInvoiceItem[];
}

export interface SalesInvoiceItem {
  id: number;
  sales_invoice_id: number;
  item_id: number;
  item_name?: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

export interface Doctor {
  id: number;
  code: string;
  name: string;
  specialization?: string;
  phone?: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  clinic_name?: string;
  visit_fee: number;
  commission_percentage: number;
  is_active: number;
}

export interface Attendance {
  id: number;
  user_id: number;
  full_name?: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_location_lat?: number;
  check_in_location_lng?: number;
  check_out_location_lat?: number;
  check_out_location_lng?: number;
  check_in_photo?: string;
  check_out_photo?: string;
  status: string;
  late_minutes: number;
  work_hours: number;
}

export interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  account_id?: number;
  paid_by?: number;
  paid_by_name?: string;
  receipt_image?: string;
}

export interface DashboardStats {
  today_sales: number;
  today_sales_count: number;
  month_sales: number;
  month_sales_count: number;
  total_clients: number;
  total_items: number;
  low_stock_items: number;
  today_attendance: number;
  pending_invoices: number;
  pending_amount: number;
  active_doctors: number;
  overdue_count?: number;
  overdue_amount?: number;
  overdue_top?: Array<{client_name: string; phone: string; invoice_count: number; total_overdue: number}>;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
}
