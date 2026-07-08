import { useState, useEffect } from 'react';
import api from '../../services/api';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import toast from 'react-hot-toast';

interface Employee {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  is_active: number;
  created_at: string;
}

export default function EmployeesPage() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', phone: '', role: 'employee', department: '' });
  const limit = 20;

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setEmployees(data);
    } catch (err) {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editId) {
        await api.put(`/auth/users/${editId}`, form);
        toast.success(t('employees.updated'));
      } else {
        await api.post('/auth/users', form);
        toast.success(t('employees.created'));
      }
      setShowModal(false);
      setEditId(null);
      setForm({ username: '', password: '', full_name: '', email: '', phone: '', role: 'employee', department: '' });
      loadEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/auth/users/${deleteId}`);
      toast.success(t('employees.deleted'));
      setDeleteId(null);
      loadEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.delete'));
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditId(emp.id);
    setForm({ username: emp.username, password: '', full_name: emp.full_name, email: emp.email || '', phone: emp.phone || '', role: emp.role, department: emp.department || '' });
    setShowModal(true);
  };

  const q = search.toLowerCase();
  const filtered = employees.filter(e =>
    e.full_name?.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q)
  );
  const totalPages = Math.ceil(filtered.length / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.employees') }]} />
      <PageHeader title={t('employees.title')} subtitle={t('employees.subtitle')} actions={
        <><button onClick={() => { setEditId(null); setForm({ username: '', password: '', full_name: '', email: '', phone: '', role: 'employee', department: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> {t('employees.add')}
        </button><PrintButton /></>
      } />

      <DataTable
        columns={[
          { key: 'full_name', label: t('common.name') },
          { key: 'username', label: t('auth.username') },
          { key: 'email', label: t('common.email') },
          { key: 'phone', label: t('common.phone') },
          { key: 'role', label: t('employees.role'), render: (v: string) => t(`employees.role_${v}`) || v },
          { key: 'department', label: t('employees.department') },
          { key: 'is_active', label: t('common.status'), render: (v) => v ? <span className="badge badge-success">{t('common.active')}</span> : <span className="badge badge-danger">{t('common.inactive')}</span> },
          { key: 'actions', label: t('common.actions'), render: (_: any, row: Employee) => (
            <div className="flex gap-2">
              <button onClick={() => handleEdit(row)} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4 text-blue-500" /></button>
              <button onClick={() => setDeleteId(row.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          )},
        ]}
        data={paginated}
        searchable
        searchValue={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        page={page}
        total={filtered.length}
        limit={limit}
        onPageChange={setPage}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? t('employees.edit') : t('employees.add')}>
        <div className="space-y-4">
          <input className="input-field" placeholder={t('auth.username')} value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
          {!editId && <input className="input-field" type="password" placeholder={t('auth.password')} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />}
          <input className="input-field" placeholder={t('common.full_name')} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
          <input className="input-field" placeholder={t('common.email')} value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          <input className="input-field" placeholder={t('common.phone')} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          <select className="input-field" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="employee">{t('employees.role_employee')}</option>
            <option value="manager">{t('employees.role_manager')}</option>
            <option value="accountant">{t('employees.role_accountant')}</option>
            <option value="sales_rep">{t('employees.role_sales_rep')}</option>
            <option value="admin">{t('employees.role_admin')}</option>
          </select>
          <select className="input-field" value={form.department} onChange={e => setForm({...form, department: e.target.value})}>
            <option value="">{t('employees.select_dept')}</option>
            <option value="admin">{t('employees.dept_admin')}</option>
            <option value="sales">{t('employees.dept_sales')}</option>
            <option value="accounting">{t('employees.dept_accounting')}</option>
            <option value="inventory">{t('employees.dept_inventory')}</option>
            <option value="hr">{t('employees.dept_hr')}</option>
          </select>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{editId ? t('common.update') : t('common.add')}</button>
          </div>
        </div>
      </Modal>

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
