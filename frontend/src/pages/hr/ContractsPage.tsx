import { useState, useEffect } from 'react';
import api from '../../services/api';
import { FileText, Plus, Pencil, Trash2, Eye, XCircle } from 'lucide-react';
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

interface Contract {
  id: number;
  user_id: number;
  user_name: string;
  contract_type: string;
  start_date: string;
  end_date: string | null;
  basic_salary: number;
  housing_allowance: number;
  transportation_allowance: number;
  insurance_deduction: number;
  notes: string;
  status: string;
  termination_date: string | null;
  termination_reason: string | null;
  created_at: string;
}

interface User {
  id: number;
  full_name: string;
}

const typeColors: Record<string, string> = {
  full_time: 'bg-blue-100 text-blue-700',
  part_time: 'bg-yellow-100 text-yellow-700',
  fixed_term: 'bg-purple-100 text-purple-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-700',
  terminated: 'bg-red-100 text-red-700',
};

const defaultForm = {
  user_id: 0,
  contract_type: 'full_time',
  start_date: '',
  end_date: '',
  basic_salary: 0,
  housing_allowance: 0,
  transportation_allowance: 0,
  insurance_deduction: 0,
  notes: '',
};

export default function ContractsPage() {
  const { t } = useTranslation();
  const typeLabels: Record<string, string> = {
    full_time: t('contracts.full_time'),
    part_time: t('contracts.part_time'),
    fixed_term: t('contracts.fixed_term'),
  };
  const statusLabels: Record<string, string> = {
    active: t('common.active'),
    expired: t('contracts.expired'),
    terminated: t('contracts.terminated'),
  };
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [terminateForm, setTerminateForm] = useState({ termination_date: '', termination_reason: '' });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
    loadContracts();
  }, []);

  useEffect(() => {
    loadContracts();
  }, [statusFilter]);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch {
      setUsers([]);
    }
  };

  const loadContracts = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/employee-contracts', { params });
      setContracts(data.contracts || []);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...form };
      if (payload.contract_type !== 'fixed_term') delete (payload as any).end_date;
      if (editId) {
        await api.put(`/employee-contracts/${editId}`, payload);
        toast.success(t('contracts.updated'));
      } else {
        await api.post('/employee-contracts', payload);
        toast.success(t('contracts.created'));
      }
      setShowModal(false);
      setEditId(null);
      setForm(defaultForm);
      loadContracts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleEdit = (c: Contract) => {
    setEditId(c.id);
    setForm({
      user_id: c.user_id,
      contract_type: c.contract_type,
      start_date: c.start_date?.slice(0, 10) || '',
      end_date: c.end_date?.slice(0, 10) || '',
      basic_salary: c.basic_salary,
      housing_allowance: c.housing_allowance,
      transportation_allowance: c.transportation_allowance,
      insurance_deduction: c.insurance_deduction,
      notes: c.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/employee-contracts/${id}`);
      toast.success(t('contracts.deleted'));
      loadContracts();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  const handleTerminate = async () => {
    if (!selectedContract) return;
    try {
      await api.put(`/employee-contracts/${selectedContract.id}`, { status: 'terminated', ...terminateForm });
      toast.success(t('contracts.terminated_toast'));
      setShowTerminate(false);
      setSelectedContract(null);
      setTerminateForm({ termination_date: '', termination_reason: '' });
      loadContracts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('contracts.terminate_error'));
    }
  };

  const viewDetail = (c: Contract) => {
    setSelectedContract(c);
    setShowDetail(true);
  };

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.contracts') }]} />
      <PageHeader title={t('contracts.title')} subtitle={t('contracts.subtitle')} actions={
        <><button onClick={() => { setEditId(null); setForm(defaultForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('contracts.add')}
        </button><PrintButton /></>
      } />

      <div className="flex items-center gap-4 mb-6">
        <select className="input-field w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{t('contracts.all_status')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="expired">{t('contracts.expired')}</option>
          <option value="terminated">{t('contracts.terminated')}</option>
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'user_name', label: t('payroll.employee') },
          { key: 'contract_type', label: t('contracts.type'), render: (v) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[v] || ''}`}>{typeLabels[v] || v}</span> },
          { key: 'start_date', label: t('contracts.start_date') },
          { key: 'end_date', label: t('contracts.end_date'), render: (v) => v || '—' },
          { key: 'basic_salary', label: t('payroll.basic_salary'), render: (v) => formatCurrency(v || 0) },
          { key: 'status', label: t('common.status'), render: (v) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[v] || ''}`}>{statusLabels[v] || v}</span> },
          {
            key: 'actions', label: '', render: (_, row) => (
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); viewDetail(row); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title={t('common.view')}><Eye className="w-4 h-4" /></button>
                {row.status === 'active' && (
                  <button onClick={(e) => { e.stopPropagation(); setSelectedContract(row); setTerminateForm({ termination_date: '', termination_reason: '' }); setShowTerminate(true); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('contracts.terminate')}><XCircle className="w-4 h-4" /></button>
                )}
                <button onClick={(e) => { e.stopPropagation(); handleEdit(row); }} className="p-1.5 hover:bg-blue-100 rounded text-blue-500" title={t('common.edit')}><Pencil className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(row.id); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
              </div>
            ),
          },
        ]}
        data={contracts}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? t('contracts.edit') : t('contracts.add')} size="lg">
        <div className="space-y-4">
          <select className="input-field" value={form.user_id} onChange={e => setForm({...form, user_id: Number(e.target.value)})}>
            <option value={0}>{t('contracts.select_employee')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <select className="input-field" value={form.contract_type} onChange={e => setForm({...form, contract_type: e.target.value})}>
            <option value="full_time">{t('contracts.full_time')}</option>
            <option value="part_time">{t('contracts.part_time')}</option>
            <option value="fixed_term">{t('contracts.fixed_term')}</option>
          </select>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('contracts.start_date')}</label>
              <input type="date" className="input-field" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
            </div>
            {form.contract_type === 'fixed_term' && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('contracts.end_date')}</label>
                <input type="date" className="input-field" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('payroll.basic_salary')}</label>
              <input type="number" className="input-field" value={form.basic_salary} onChange={e => setForm({...form, basic_salary: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('contracts.housing_allowance')}</label>
              <input type="number" className="input-field" value={form.housing_allowance} onChange={e => setForm({...form, housing_allowance: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('contracts.transportation_allowance')}</label>
              <input type="number" className="input-field" value={form.transportation_allowance} onChange={e => setForm({...form, transportation_allowance: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('contracts.insurance_deduction')}</label>
              <input type="number" className="input-field" value={form.insurance_deduction} onChange={e => setForm({...form, insurance_deduction: Number(e.target.value)})} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('contracts.notes')}</label>
            <textarea className="input-field" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{editId ? t('common.update') : t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={t('contracts.details')} size="lg">
        {selectedContract && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-gray-500">{t('payroll.employee')}</p><p className="font-medium">{selectedContract.user_name}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.type')}</p><p className="font-medium">{typeLabels[selectedContract.contract_type]}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.start_date')}</p><p className="font-medium">{selectedContract.start_date}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.end_date')}</p><p className="font-medium">{selectedContract.end_date || '—'}</p></div>
              <div><p className="text-sm text-gray-500">{t('payroll.basic_salary')}</p><p className="font-medium">{formatCurrency(selectedContract.basic_salary || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.housing_allowance')}</p><p className="font-medium">{formatCurrency(selectedContract.housing_allowance || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.transportation_allowance')}</p><p className="font-medium">{formatCurrency(selectedContract.transportation_allowance || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('contracts.insurance_deduction')}</p><p className="font-medium">{formatCurrency(selectedContract.insurance_deduction || 0)}</p></div>
              <div><p className="text-sm text-gray-500">{t('common.status')}</p><p><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[selectedContract.status] || ''}`}>{statusLabels[selectedContract.status]}</span></p></div>
            </div>
            {selectedContract.notes && (
              <div><p className="text-sm text-gray-500">{t('contracts.notes')}</p><p className="font-medium">{selectedContract.notes}</p></div>
            )}
            {selectedContract.status === 'terminated' && (
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-gray-500">{t('contracts.termination_date')}</p><p className="font-medium">{selectedContract.termination_date}</p></div>
                <div><p className="text-sm text-gray-500">{t('contracts.termination_reason')}</p><p className="font-medium">{selectedContract.termination_reason}</p></div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={showTerminate} onClose={() => setShowTerminate(false)} title={t('contracts.terminate')}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('contracts.termination_date')}</label>
            <input type="date" className="input-field" value={terminateForm.termination_date} onChange={e => setTerminateForm({...terminateForm, termination_date: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('contracts.termination_reason')}</label>
            <textarea className="input-field" rows={3} value={terminateForm.termination_reason} onChange={e => setTerminateForm({...terminateForm, termination_reason: e.target.value})} />
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowTerminate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleTerminate} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">{t('contracts.terminate')}</button>
          </div>
        </div>
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
