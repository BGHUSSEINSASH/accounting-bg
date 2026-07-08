import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';
import { Wallet, Plus, Trash2, Eye, CheckCircle, XCircle } from 'lucide-react';
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

interface Loan {
  id: number;
  user_id: number;
  user_name: string;
  total_amount: number;
  remaining_amount: number;
  monthly_deduction: number;
  start_month: string;
  end_month: string;
  reason: string;
  status: string;
  created_at: string;
}

interface User {
  id: number;
  full_name: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const defaultForm = {
  user_id: 0,
  total_amount: 0,
  monthly_deduction: 0,
  start_month: '',
  reason: '',
};

function calcEndMonth(start: string, total: number, monthly: number): string {
  if (!start || !total || !monthly) return '';
  const months = Math.ceil(total / monthly);
  const d = new Date(start + '-01');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 7);
}

export default function LoansPage() {
  const { t } = useTranslation();
  const statusLabels: Record<string, string> = {
    active: t('common.active'),
    paid: t('loans.paid'),
    cancelled: t('loans.cancelled'),
  };
  const [loans, setLoans] = useState<Loan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
    loadLoans();
  }, []);

  useEffect(() => {
    loadLoans();
  }, [statusFilter]);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch {
      setUsers([]);
    }
  };

  const loadLoans = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/employee-loans', { params });
      setLoans(data.loans || []);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...form,
        end_month: calcEndMonth(form.start_month, form.total_amount, form.monthly_deduction),
      };
      if (editId) {
        await api.put(`/employee-loans/${editId}`, payload);
        toast.success(t('loans.updated'));
      } else {
        await api.post('/employee-loans', payload);
        toast.success(t('loans.created'));
      }
      setShowModal(false);
      setEditId(null);
      setForm(defaultForm);
      loadLoans();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.put(`/employee-loans/${id}`, { status });
      toast.success(status === 'paid' ? t('loans.marked_paid') : t('loans.cancelled_toast'));
      loadLoans();
    } catch {
      toast.error(t('loans.update_error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/employee-loans/${id}`);
      toast.success(t('loans.deleted'));
      loadLoans();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  const viewDetail = (l: Loan) => {
    setSelectedLoan(l);
    setShowDetail(true);
  };

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.loans') }]} />
      <PageHeader title={t('loans.title')} subtitle={t('loans.subtitle')} actions={
        <><button onClick={() => { setEditId(null); setForm(defaultForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('loans.add')}
        </button><PrintButton /></>
      } />

      <div className="flex items-center gap-4 mb-6">
        <select className="input-field w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{t('loans.all_status')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="paid">{t('loans.paid')}</option>
          <option value="cancelled">{t('loans.cancelled')}</option>
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'user_name', label: t('payroll.employee'), render: (v: string) => <Link to={'/hr/employees'} className="hover:text-primary-600 transition-colors">{v}</Link> },
          { key: 'total_amount', label: t('loans.total_amount'), render: (v) => formatCurrency(v || 0) },
          { key: 'remaining_amount', label: t('loans.remaining_amount'), render: (v) => formatCurrency(v || 0) },
          { key: 'monthly_deduction', label: t('loans.monthly_deduction'), render: (v) => formatCurrency(v || 0) },
          { key: 'start_month', label: t('loans.start_month') },
          { key: 'end_month', label: t('loans.end_month') },
          { key: 'status', label: t('common.status'), render: (v) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[v] || ''}`}>{statusLabels[v] || v}</span> },
          {
            key: 'actions', label: '', render: (_, row) => (
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); viewDetail(row); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title={t('common.view')}><Eye className="w-4 h-4" /></button>
                {row.status === 'active' && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); handleStatusChange(row.id, 'paid'); }} className="p-1.5 hover:bg-green-100 rounded text-green-500" title={t('common.pay')}><CheckCircle className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleStatusChange(row.id, 'cancelled'); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('common.cancel')}><XCircle className="w-4 h-4" /></button>
                  </>
                )}
                {row.status === 'active' && (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(row.id); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ),
          },
        ]}
        data={loans}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? t('loans.edit') : t('loans.add')} size="lg">
        <div className="space-y-4">
          <select className="input-field" value={form.user_id} onChange={e => setForm({...form, user_id: Number(e.target.value)})}>
            <option value={0}>{t('loans.select_employee')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('loans.total_amount')}</label>
              <input type="number" className="input-field" value={form.total_amount} onChange={e => setForm({...form, total_amount: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('loans.monthly_deduction')}</label>
              <input type="number" className="input-field" value={form.monthly_deduction} onChange={e => setForm({...form, monthly_deduction: Number(e.target.value)})} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('loans.start_month')}</label>
            <input type="month" className="input-field" value={form.start_month} onChange={e => setForm({...form, start_month: e.target.value})} />
            {form.start_month && form.total_amount > 0 && form.monthly_deduction > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {t('loans.expected_end')}: {calcEndMonth(form.start_month, form.total_amount, form.monthly_deduction)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('loans.reason')}</label>
            <textarea className="input-field" rows={3} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} />
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{editId ? t('common.update') : t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={t('loans.details')} size="lg">
        {selectedLoan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-gray-500">{t('payroll.employee')}</p><p className="font-medium">{selectedLoan.user_name}</p></div>
              <div><p className="text-sm text-gray-500">{t('loans.total_amount')}</p><p className="font-medium">{formatCurrency(selectedLoan.total_amount || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('loans.remaining_amount')}</p><p className="font-medium">{formatCurrency(selectedLoan.remaining_amount || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('loans.monthly_deduction')}</p><p className="font-medium">{formatCurrency(selectedLoan.monthly_deduction || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('loans.start_month')}</p><p className="font-medium">{selectedLoan.start_month}</p></div>
              <div><p className="text-sm text-gray-500">{t('loans.end_month')}</p><p className="font-medium">{selectedLoan.end_month}</p></div>
              <div><p className="text-sm text-gray-500">{t('common.status')}</p><p><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[selectedLoan.status] || ''}`}>{statusLabels[selectedLoan.status]}</span></p></div>
            </div>
            {selectedLoan.reason && (
              <div><p className="text-sm text-gray-500">{t('loans.reason')}</p><p className="font-medium">{selectedLoan.reason}</p></div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('common.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
