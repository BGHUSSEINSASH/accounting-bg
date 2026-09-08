import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
  UserPlus, Pencil, Trash2, Eye, TrendingUp, ChevronDown, ChevronUp,
  User, DollarSign, History, FileText, Building2, Phone, Mail,
  CreditCard, Briefcase, Calendar, CheckCircle, XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Employee {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  national_id: string | null;
  iban: string | null;
  bank_name: string | null;
  basic_salary: number;
  housing_allowance: number;
  transportation_allowance: number;
  insurance_deduction: number;
  total_salary: number;
  net_salary: number;
  is_active: number;
  created_at: string;
  active_contract?: any;
  salary_history?: SalaryChange[];
}

interface SalaryChange {
  id: number;
  user_id: number;
  old_basic_salary: number;
  new_basic_salary: number;
  old_housing_allowance: number;
  new_housing_allowance: number;
  old_transportation_allowance: number;
  new_transportation_allowance: number;
  change_reason: string;
  effective_date: string;
  changed_by_name: string;
  created_at: string;
}

const emptyForm = {
  username: '', password: '', full_name: '', email: '', phone: '',
  role: 'employee', department: '', position: '', hire_date: '',
  national_id: '', iban: '', bank_name: '',
  basic_salary: 0, housing_allowance: 0, transportation_allowance: 0, insurance_deduction: 0,
};

// ─── Helper Badge ─────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    accountant: 'bg-teal-100 text-teal-700',
    sales_rep: 'bg-orange-100 text-orange-700',
    employee: 'bg-gray-100 text-gray-700',
  };
  const labels: Record<string, string> = {
    admin: 'مدير النظام', manager: 'مدير', accountant: 'محاسب',
    sales_rep: 'مندوب', employee: 'موظف',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-600'}`}>
      {labels[role] || role}
    </span>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
        active ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const { t } = useTranslation();

  // Lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modal states
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showIncrease, setShowIncrease] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Selected employee
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [detailTab, setDetailTab] = useState(0);

  // Forms
  const [form, setForm] = useState({ ...emptyForm });
  const [increaseForm, setIncreaseForm] = useState({
    new_basic_salary: 0,
    new_housing_allowance: 0,
    new_transportation_allowance: 0,
    change_reason: '',
    effective_date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  // ─── Load ───────────────────────────────────────────────────────────────
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (deptFilter) params.department = deptFilter;
      const { data } = await api.get('/hr/employees', { params });
      setEmployees(data.employees || []);
    } catch {
      toast.error(t('error.load'));
      setEmployees([]);
    } finally { setLoading(false); }
  }, [search, roleFilter, deptFilter]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // ─── Detail view ─────────────────────────────────────────────────────────
  const openDetail = async (emp: Employee) => {
    try {
      const { data } = await api.get(`/hr/employees/${emp.id}`);
      setSelectedEmp(data);
      setDetailTab(0);
      setShowDetail(true);
    } catch {
      setSelectedEmp(emp);
      setShowDetail(true);
    }
  };

  // ─── Add / Edit submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.full_name.trim()) { toast.error('الاسم الكامل مطلوب'); return; }
    if (!editId && !form.username.trim()) { toast.error('اسم المستخدم مطلوب'); return; }
    if (!editId && !form.password) { toast.error('كلمة المرور مطلوبة'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/hr/employees/${editId}`, form);
        toast.success('تم تحديث الموظف بنجاح');
      } else {
        await api.post('/hr/employees', form);
        toast.success('تم إضافة الموظف بنجاح');
      }
      setShowAddEdit(false);
      setEditId(null);
      setForm({ ...emptyForm });
      loadEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    } finally { setSaving(false); }
  };

  const openEdit = (emp: Employee) => {
    setEditId(emp.id);
    setForm({
      username: emp.username, password: '',
      full_name: emp.full_name, email: emp.email || '', phone: emp.phone || '',
      role: emp.role, department: emp.department || '', position: emp.position || '',
      hire_date: emp.hire_date?.slice(0, 10) || '', national_id: emp.national_id || '',
      iban: emp.iban || '', bank_name: emp.bank_name || '',
      basic_salary: emp.basic_salary, housing_allowance: emp.housing_allowance,
      transportation_allowance: emp.transportation_allowance,
      insurance_deduction: emp.insurance_deduction,
    });
    setShowAddEdit(true);
  };

  // ─── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/hr/employees/${deleteId}`);
      toast.success(t('employees.deleted'));
      setDeleteId(null);
      loadEmployees();
    } catch (err: any) { toast.error(err.response?.data?.error || t('error.delete')); }
  };

  // ─── Salary Increase ─────────────────────────────────────────────────────
  const openIncrease = (emp: Employee) => {
    setSelectedEmp(emp);
    setIncreaseForm({
      new_basic_salary: emp.basic_salary,
      new_housing_allowance: emp.housing_allowance,
      new_transportation_allowance: emp.transportation_allowance,
      change_reason: '',
      effective_date: new Date().toISOString().split('T')[0],
    });
    setShowIncrease(true);
  };

  const handleIncrease = async () => {
    if (!selectedEmp) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/hr/employees/${selectedEmp.id}/salary-increase`, increaseForm);
      toast.success(`تم رفع الراتب بنجاح — الزيادة: ${formatCurrency(data.increase_amount)} (${data.increase_percent}%)`);
      setShowIncrease(false);
      loadEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل في رفع الراتب');
    } finally { setSaving(false); }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────
  const filteredEmployees = employees;
  const totalPages = Math.ceil(filteredEmployees.length / limit);
  const paginated = filteredEmployees.slice((page - 1) * limit, page * limit);

  // Increase preview
  const currentTotal = (selectedEmp?.basic_salary || 0) + (selectedEmp?.housing_allowance || 0) + (selectedEmp?.transportation_allowance || 0);
  const newTotal = increaseForm.new_basic_salary + increaseForm.new_housing_allowance + increaseForm.new_transportation_allowance;
  const increaseAmt = newTotal - currentTotal;
  const increasePct = currentTotal > 0 ? ((increaseAmt / currentTotal) * 100).toFixed(1) : '0';

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.employees') }]} />
      <PageHeader
        title={t('employees.title')}
        subtitle={`${employees.length} ${t('hr.employees')}`}
        actions={
          <>
            <button
              onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowAddEdit(true); }}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> {t('employees.add')}
            </button>
            <PrintButton />
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="input-field flex-1 min-w-48"
          placeholder="بحث بالاسم أو اسم المستخدم..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="input-field w-40" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">كل الأدوار</option>
          <option value="admin">مدير النظام</option>
          <option value="manager">مدير</option>
          <option value="accountant">محاسب</option>
          <option value="sales_rep">مندوب</option>
          <option value="employee">موظف</option>
        </select>
        <select className="input-field w-40" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">كل الأقسام</option>
          <option value="admin">الإدارة</option>
          <option value="sales">المبيعات</option>
          <option value="accounting">المحاسبة</option>
          <option value="inventory">المخزون</option>
          <option value="hr">الموارد البشرية</option>
        </select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'إجمالي الموظفين', value: employees.length, icon: User, color: 'bg-blue-50 text-blue-600' },
          { label: 'إجمالي فاتورة الرواتب', value: formatCurrency(employees.reduce((s, e) => s + (e.net_salary || 0), 0)), icon: DollarSign, color: 'bg-green-50 text-green-600' },
          { label: 'متوسط الراتب', value: formatCurrency(employees.length ? employees.reduce((s, e) => s + (e.basic_salary || 0), 0) / employees.length : 0), icon: TrendingUp, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'الموظفون النشطون', value: employees.filter(e => e.is_active).length, icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="card p-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.color}`}><s.icon className="w-5 h-5" /></div>
            <div>
              <p className="text-lg font-bold leading-tight">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['الموظف', 'القسم / المسمى', 'الدور', 'الراتب الأساسي', 'إجمالي الراتب', 'صافي الراتب', 'الحالة', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">لا يوجد موظفون</td></tr>
              )}
              {paginated.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-600 font-bold text-sm">{emp.full_name?.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{emp.full_name}</p>
                        <p className="text-xs text-gray-400">{emp.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{emp.department || '—'}</p>
                    <p className="text-xs text-gray-400">{emp.position || '—'}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={emp.role} /></td>
                  <td className="px-4 py-3 font-mono">
                    <span className={emp.basic_salary > 0 ? 'text-gray-900 font-medium' : 'text-gray-400 text-xs'}>
                      {emp.basic_salary > 0 ? formatCurrency(emp.basic_salary) : 'غير محدد'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className={emp.total_salary > 0 ? 'text-blue-700 font-medium' : 'text-gray-400 text-xs'}>
                      {emp.total_salary > 0 ? formatCurrency(emp.total_salary) : '—'}
                    </span>
                    {emp.total_salary > emp.basic_salary && emp.basic_salary > 0 && (
                      <p className="text-xs text-green-600">
                        +{formatCurrency(emp.total_salary - emp.basic_salary)} بدلات
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className="text-green-700 font-bold">{formatCurrency(emp.net_salary)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {emp.is_active
                      ? <span className="badge badge-success text-xs">نشط</span>
                      : <span className="badge badge-danger text-xs">موقوف</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openDetail(emp)} title="عرض التفاصيل"
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-500 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(emp)} title="تعديل"
                        className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => openIncrease(emp)} title="رفع راتب"
                        className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 transition-colors">
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteId(emp.id)} title="حذف"
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
            <span className="text-gray-500">{filteredEmployees.length} موظف</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                السابق
              </button>
              <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Add/Edit Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={showAddEdit} onClose={() => setShowAddEdit(false)}
        title={editId ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'} size="lg">
        <div className="space-y-5">
          {/* Personal */}
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <User className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-gray-700">المعلومات الشخصية</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الاسم الكامل *</label>
                <input className="input-field" placeholder="الاسم الكامل" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">اسم المستخدم {!editId && '*'}</label>
                <input className="input-field" placeholder="username" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  disabled={!!editId} />
              </div>
              {!editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">كلمة المرور *</label>
                  <input className="input-field" type="password" placeholder="••••••••" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الرقم الوطني</label>
                <input className="input-field" placeholder="الرقم الوطني" value={form.national_id}
                  onChange={e => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">البريد الإلكتروني</label>
                <input className="input-field" type="email" placeholder="email@example.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الهاتف</label>
                <input className="input-field" placeholder="07XX-XXX-XXXX" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Job info */}
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Briefcase className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-gray-700">المعلومات الوظيفية</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الدور</label>
                <select className="input-field" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">موظف</option>
                  <option value="sales_rep">مندوب مبيعات</option>
                  <option value="accountant">محاسب</option>
                  <option value="manager">مدير</option>
                  <option value="admin">مدير النظام</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">القسم</label>
                <select className="input-field" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                  <option value="">-- اختر القسم --</option>
                  <option value="admin">الإدارة</option>
                  <option value="sales">المبيعات</option>
                  <option value="accounting">المحاسبة</option>
                  <option value="inventory">المخزون</option>
                  <option value="hr">الموارد البشرية</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">المسمى الوظيفي</label>
                <input className="input-field" placeholder="مثل: محاسب أول، مدير مبيعات" value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ التعيين</label>
                <input className="input-field" type="date" value={form.hire_date}
                  onChange={e => setForm({ ...form, hire_date: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Salary */}
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <DollarSign className="w-4 h-4 text-green-500" />
              <h3 className="font-semibold text-gray-700">بيانات الراتب</h3>
              {(form.basic_salary + form.housing_allowance + form.transportation_allowance) > 0 && (
                <span className="mr-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  الإجمالي: {formatCurrency(form.basic_salary + form.housing_allowance + form.transportation_allowance)}
                  {' | '}صافي: {formatCurrency(form.basic_salary + form.housing_allowance + form.transportation_allowance - form.insurance_deduction)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الراتب الأساسي</label>
                <input className="input-field" type="number" min="0" value={form.basic_salary}
                  onChange={e => setForm({ ...form, basic_salary: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">بدل السكن</label>
                <input className="input-field" type="number" min="0" value={form.housing_allowance}
                  onChange={e => setForm({ ...form, housing_allowance: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">بدل النقل</label>
                <input className="input-field" type="number" min="0" value={form.transportation_allowance}
                  onChange={e => setForm({ ...form, transportation_allowance: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">خصم التأمين</label>
                <input className="input-field" type="number" min="0" value={form.insurance_deduction}
                  onChange={e => setForm({ ...form, insurance_deduction: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {/* Bank */}
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <CreditCard className="w-4 h-4 text-purple-500" />
              <h3 className="font-semibold text-gray-700">بيانات البنك</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">اسم البنك</label>
                <input className="input-field" placeholder="بنك الرافدين..." value={form.bank_name}
                  onChange={e => setForm({ ...form, bank_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">رقم الحساب IBAN</label>
                <input className="input-field" placeholder="IQ..." value={form.iban}
                  onChange={e => setForm({ ...form, iban: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t">
            <button onClick={() => setShowAddEdit(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              إلغاء
            </button>
            <button onClick={handleSubmit} disabled={saving} className="btn-primary px-6">
              {saving ? 'جاري الحفظ...' : (editId ? 'حفظ التغييرات' : 'إضافة الموظف')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Detail Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}
        title={selectedEmp?.full_name || 'تفاصيل الموظف'} size="lg">
        {selectedEmp && (
          <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b overflow-x-auto">
              <TabBtn active={detailTab === 0} onClick={() => setDetailTab(0)}>
                <div className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> الشخصية</div>
              </TabBtn>
              <TabBtn active={detailTab === 1} onClick={() => setDetailTab(1)}>
                <div className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> الراتب</div>
              </TabBtn>
              <TabBtn active={detailTab === 2} onClick={() => setDetailTab(2)}>
                <div className="flex items-center gap-1"><History className="w-3.5 h-3.5" /> تاريخ الراتب</div>
              </TabBtn>
              {selectedEmp.active_contract && (
                <TabBtn active={detailTab === 3} onClick={() => setDetailTab(3)}>
                  <div className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> العقد</div>
                </TabBtn>
              )}
            </div>

            {/* Tab 0: Personal */}
            {detailTab === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-600">
                    {selectedEmp.full_name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedEmp.full_name}</h3>
                    <p className="text-gray-500">{selectedEmp.position || selectedEmp.role}</p>
                    {selectedEmp.is_active
                      ? <span className="badge badge-success text-xs mt-1">نشط</span>
                      : <span className="badge badge-danger text-xs mt-1">موقوف</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Mail, label: 'البريد الإلكتروني', val: selectedEmp.email },
                    { icon: Phone, label: 'الهاتف', val: selectedEmp.phone },
                    { icon: Building2, label: 'القسم', val: selectedEmp.department },
                    { icon: Briefcase, label: 'المسمى الوظيفي', val: selectedEmp.position },
                    { icon: Calendar, label: 'تاريخ التعيين', val: selectedEmp.hire_date?.slice(0, 10) },
                    { icon: User, label: 'الرقم الوطني', val: selectedEmp.national_id },
                  ].map(item => item.val && (
                    <div key={item.label} className="flex items-start gap-2">
                      <item.icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="text-sm font-medium text-gray-800">{item.val}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {(selectedEmp.bank_name || selectedEmp.iban) && (
                  <div className="border rounded-xl p-3 bg-purple-50">
                    <p className="text-xs font-semibold text-purple-700 mb-2">بيانات البنك</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {selectedEmp.bank_name && <div><p className="text-xs text-gray-400">البنك</p><p className="font-medium">{selectedEmp.bank_name}</p></div>}
                      {selectedEmp.iban && <div><p className="text-xs text-gray-400">IBAN</p><p className="font-medium font-mono text-xs">{selectedEmp.iban}</p></div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 1: Salary */}
            {detailTab === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'الراتب الأساسي', val: selectedEmp.basic_salary, color: 'text-gray-800', bg: 'bg-gray-50' },
                    { label: 'بدل السكن', val: selectedEmp.housing_allowance, color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: 'بدل النقل', val: selectedEmp.transportation_allowance, color: 'text-indigo-700', bg: 'bg-indigo-50' },
                    { label: 'خصم التأمين', val: -selectedEmp.insurance_deduction, color: 'text-red-600', bg: 'bg-red-50' },
                  ].map(item => (
                    <div key={item.label} className={`rounded-xl p-3 ${item.bg}`}>
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className={`text-lg font-bold ${item.color}`}>{formatCurrency(Math.abs(item.val))}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t-2 border-dashed pt-3 grid grid-cols-2 gap-3">
                  <div className="bg-blue-600 text-white rounded-xl p-3">
                    <p className="text-xs text-blue-100 mb-1">الإجمالي (الراتب + البدلات)</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedEmp.total_salary)}</p>
                  </div>
                  <div className="bg-green-600 text-white rounded-xl p-3">
                    <p className="text-xs text-green-100 mb-1">صافي الراتب</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedEmp.net_salary)}</p>
                  </div>
                </div>
                <button onClick={() => { setShowDetail(false); openIncrease(selectedEmp); }}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-2.5">
                  <TrendingUp className="w-4 h-4" /> رفع الراتب
                </button>
              </div>
            )}

            {/* Tab 2: Salary History */}
            {detailTab === 2 && (
              <div>
                {!selectedEmp.salary_history || selectedEmp.salary_history.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>لا يوجد تاريخ لتغييرات الراتب</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto">
                    {selectedEmp.salary_history.map((h, i) => (
                      <div key={h.id} className={`border rounded-xl p-3 ${i === 0 ? 'border-green-200 bg-green-50' : ''}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-xs text-gray-400">{h.effective_date?.slice(0, 10)}</p>
                            <p className="text-sm font-medium text-gray-700">{h.change_reason || 'تغيير راتب'}</p>
                            {h.changed_by_name && <p className="text-xs text-gray-400">بواسطة: {h.changed_by_name}</p>}
                          </div>
                          {i === 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">الحالي</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {[
                            { l: 'الأساسي', old: h.old_basic_salary, new_: h.new_basic_salary },
                            { l: 'السكن', old: h.old_housing_allowance, new_: h.new_housing_allowance },
                            { l: 'النقل', old: h.old_transportation_allowance, new_: h.new_transportation_allowance },
                          ].map(row => (
                            <div key={row.l} className="bg-white rounded-lg p-2">
                              <p className="text-gray-400 mb-1">{row.l}</p>
                              <p className="text-red-400 line-through">{formatCurrency(row.old)}</p>
                              <p className="text-green-700 font-bold">{formatCurrency(row.new_)}</p>
                              {row.new_ - row.old !== 0 && (
                                <p className={`font-medium ${row.new_ > row.old ? 'text-green-600' : 'text-red-500'}`}>
                                  {row.new_ > row.old ? '+' : ''}{formatCurrency(row.new_ - row.old)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Contract */}
            {detailTab === 3 && selectedEmp.active_contract && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { l: 'نوع العقد', v: selectedEmp.active_contract.contract_type },
                    { l: 'الحالة', v: selectedEmp.active_contract.status },
                    { l: 'تاريخ البداية', v: selectedEmp.active_contract.start_date?.slice(0, 10) },
                    { l: 'تاريخ النهاية', v: selectedEmp.active_contract.end_date?.slice(0, 10) || 'مفتوح' },
                    { l: 'الراتب الأساسي', v: formatCurrency(selectedEmp.active_contract.basic_salary || 0) },
                    { l: 'بدل السكن', v: formatCurrency(selectedEmp.active_contract.housing_allowance || 0) },
                  ].map(item => (
                    <div key={item.l} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-400">{item.l}</p>
                      <p className="font-medium text-gray-800">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Salary Increase Modal ──────────────────────────────────────── */}
      <Modal isOpen={showIncrease} onClose={() => setShowIncrease(false)}
        title={`رفع راتب — ${selectedEmp?.full_name}`} size="md">
        {selectedEmp && (
          <div className="space-y-4">
            {/* Current vs New */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <p className="font-semibold text-gray-600 mb-3">الراتب الحالي</p>
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-xs text-gray-400">الأساسي</p><p className="font-bold">{formatCurrency(selectedEmp.basic_salary)}</p></div>
                <div><p className="text-xs text-gray-400">السكن</p><p className="font-bold">{formatCurrency(selectedEmp.housing_allowance)}</p></div>
                <div><p className="text-xs text-gray-400">النقل</p><p className="font-bold">{formatCurrency(selectedEmp.transportation_allowance)}</p></div>
              </div>
              <div className="mt-2 pt-2 border-t flex justify-between">
                <span className="text-gray-500">الإجمالي الحالي</span>
                <span className="font-bold text-blue-700">{formatCurrency(currentTotal)}</span>
              </div>
            </div>

            {/* New salary inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الراتب الأساسي الجديد *</label>
                <input type="number" min="0" className="input-field" value={increaseForm.new_basic_salary}
                  onChange={e => setIncreaseForm({ ...increaseForm, new_basic_salary: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">بدل السكن الجديد</label>
                  <input type="number" min="0" className="input-field" value={increaseForm.new_housing_allowance}
                    onChange={e => setIncreaseForm({ ...increaseForm, new_housing_allowance: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">بدل النقل الجديد</label>
                  <input type="number" min="0" className="input-field" value={increaseForm.new_transportation_allowance}
                    onChange={e => setIncreaseForm({ ...increaseForm, new_transportation_allowance: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">سبب الزيادة</label>
                <input className="input-field" placeholder="مثل: مراجعة سنوية، ترقية..." value={increaseForm.change_reason}
                  onChange={e => setIncreaseForm({ ...increaseForm, change_reason: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ السريان</label>
                <input type="date" className="input-field" value={increaseForm.effective_date}
                  onChange={e => setIncreaseForm({ ...increaseForm, effective_date: e.target.value })} />
              </div>
            </div>

            {/* Preview */}
            {newTotal > 0 && (
              <div className={`rounded-xl p-4 ${increaseAmt >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">الإجمالي الجديد</span>
                  <span className="font-bold text-lg text-blue-700">{formatCurrency(newTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">قيمة الزيادة</span>
                  <span className={`font-bold ${increaseAmt >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {increaseAmt >= 0 ? '+' : ''}{formatCurrency(increaseAmt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">نسبة الزيادة</span>
                  <span className={`font-bold ${increaseAmt >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {increaseAmt >= 0 ? '+' : ''}{increasePct}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowIncrease(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                إلغاء
              </button>
              <button onClick={handleIncrease} disabled={saving || increaseForm.new_basic_salary <= 0}
                className="btn-primary px-6 flex items-center gap-2 disabled:opacity-50">
                <TrendingUp className="w-4 h-4" />
                {saving ? 'جاري الحفظ...' : 'تأكيد رفع الراتب'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Delete Confirm ─────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('employees.delete_title')}
        message={t('employees.delete_message')}
        variant="danger"
      />
    </div>
  );
}
