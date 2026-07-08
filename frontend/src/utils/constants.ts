export const ROLES = [
  { value: 'admin', label: 'مدير النظام' },
  { value: 'manager', label: 'مدير' },
  { value: 'accountant', label: 'محاسب' },
  { value: 'sales_rep', label: 'مندوب مبيعات' },
  { value: 'employee', label: 'موظف' },
];

export const DEPARTMENTS = [
  { value: 'admin', label: 'الإدارة' },
  { value: 'sales', label: 'المبيعات' },
  { value: 'accounting', label: 'المحاسبة' },
  { value: 'inventory', label: 'المخزون' },
  { value: 'hr', label: 'الموارد البشرية' },
];

export const ACCOUNT_TYPES = [
  { value: 'asset', label: 'أصول' },
  { value: 'liability', label: 'خصوم' },
  { value: 'equity', label: 'حقوق ملكية' },
  { value: 'income', label: 'إيرادات' },
  { value: 'expense', label: 'مصروفات' },
];

export const PAYMENT_STATUS = [
  { value: 'paid', label: 'مدفوع' },
  { value: 'partial', label: 'مدفوع جزئياً' },
  { value: 'unpaid', label: 'غير مدفوع' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'card', label: 'بطاقة' },
  { value: 'credit', label: 'آجل' },
  { value: 'transfer', label: 'تحويل بنكي' },
];

export const ATTENDANCE_STATUS = [
  { value: 'present', label: 'حاضر' },
  { value: 'late', label: 'متأخر' },
  { value: 'absent', label: 'غائب' },
  { value: 'half_day', label: 'نصف يوم' },
];

export const LEAVE_TYPES = [
  { value: 'annual', label: 'إجازة سنوية' },
  { value: 'sick', label: 'إجازة مرضية' },
  { value: 'emergency', label: 'إجازة طارئة' },
  { value: 'personal', label: 'إجازة شخصية' },
];
