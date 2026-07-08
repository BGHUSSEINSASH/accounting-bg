import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  full_name: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.enum(['admin', 'manager', 'accountant', 'sales_rep', 'employee']),
  department: z.enum(['admin', 'sales', 'accounting', 'inventory', 'hr']).optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(100),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  name_en: z.string().optional().or(z.literal('')),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  parent_id: z.number().int().positive().optional().nullable(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  name_en: z.string().optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

export const createJournalEntrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional().or(z.literal('')),
  reference_type: z.enum(['sale', 'purchase', 'expense', 'transfer', 'opening']).optional(),
  reference_id: z.number().int().positive().optional().nullable(),
  items: z.array(z.object({
    account_id: z.number().int().positive(),
    description: z.string().optional().or(z.literal('')),
    debit: z.number().min(0),
    credit: z.number().min(0),
  })).min(1, 'At least one item is required'),
});

export const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  tax_number: z.string().optional().or(z.literal('')),
  credit_limit: z.number().min(0).optional(),
  notes: z.string().optional().or(z.literal('')),
  sales_rep_id: z.number().int().positive().optional().nullable(),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  tax_number: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  name_en: z.string().optional().or(z.literal('')),
  category: z.string().optional().or(z.literal('')),
  unit: z.string().optional(),
  purchase_price: z.number().min(0).optional(),
  selling_price: z.number().min(0).optional(),
  current_quantity: z.number().min(0).optional(),
  min_quantity: z.number().min(0).optional(),
  max_quantity: z.number().min(0).optional(),
  barcode: z.string().optional().or(z.literal('')),
});

export const createDoctorSchema = z.object({
  name: z.string().min(1).max(100),
  specialization: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  clinic_name: z.string().optional().or(z.literal('')),
  visit_fee: z.number().min(0).optional(),
  commission_percentage: z.number().min(0).max(100).optional(),
  notes: z.string().optional().or(z.literal('')),
});

export const createSaleInvoiceSchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  client_id: z.number().int().positive().optional().nullable(),
  sales_rep_id: z.number().int().positive().optional().nullable(),
  subtotal: z.number().min(0),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  total: z.number().min(0),
  paid_amount: z.number().min(0).optional(),
  payment_method: z.enum(['cash', 'card', 'credit', 'transfer']).optional(),
  notes: z.string().optional().or(z.literal('')),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  doctor_id: z.number().int().positive().optional().nullable(),
  commission_amount: z.number().min(0).optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().min(0.001),
    unit_price: z.number().min(0),
    discount: z.number().min(0).optional(),
    total: z.number().min(0),
  })).min(1, 'At least one item is required'),
});

export const createPurchaseInvoiceSchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier_id: z.number().int().positive().optional().nullable(),
  subtotal: z.number().min(0),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  total: z.number().min(0),
  payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
  notes: z.string().optional().or(z.literal('')),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().min(0.001),
    unit_price: z.number().min(0),
    total: z.number().min(0),
  })).min(1, 'At least one item is required'),
});

export const createExpenseSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().optional().or(z.literal('')),
  description: z.string().min(1),
  amount: z.number().min(0.01),
  account_id: z.number().int().positive().optional().nullable(),
});

export const checkInSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  notes: z.string().optional(),
});

export const checkOutSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
  search: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export const dateRangeSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
