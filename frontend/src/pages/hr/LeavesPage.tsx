import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';
import { CalendarCheck, CheckCircle, XCircle, Clock } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import toast from 'react-hot-toast';

interface LeaveRequest {
  id: number;
  user_id: number;
  full_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: string;
  created_at: string;
}

export default function LeavesPage() {
  const { t } = useTranslation();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' });

  useEffect(() => { loadLeaves(); }, []);

  const loadLeaves = async () => {
    try {
      const { data } = await api.get('/leaves');
      setLeaves(data.leaves || []);
    } catch {
      // Leaves endpoint not yet implemented - show empty
      setLeaves([]);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    try {
      await api.post('/leaves', form);
      toast.success(t('leaves.submitted'));
      setShowModal(false);
      setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' });
      loadLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('leaves.submit_error'));
    }
  };

  const handleAction = async (id: number, action: 'approved' | 'rejected') => {
    try {
      await api.put(`/leaves/${id}`, { status: action });
      toast.success(action === 'approved' ? t('leaves.approved_toast') : t('leaves.rejected_toast'));
      loadLeaves();
    } catch { toast.error(t('leaves.update_error')); }
  };

  const typeLabels: Record<string, string> = { annual: t('leaves.annual'), sick: t('leaves.sick'), emergency: t('leaves.emergency'), personal: t('leaves.personal') };
  const statusColors: Record<string, string> = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
  const statusLabels: Record<string, string> = { pending: t('leaves.status_pending'), approved: t('leaves.status_approved'), rejected: t('leaves.status_rejected') };

  if (loading) return <CardSkeleton count={2} />;

  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'rejected').length;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.leaves') }]} />
      <PageHeader title={t('leaves.title')} subtitle={t('leaves.subtitle')} actions={
        <><button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <CalendarCheck className="w-4 h-4" /> {t('leaves.request')}
        </button><PrintButton /></>
      } />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-yellow-100 rounded-lg"><Clock className="w-6 h-6 text-yellow-600" /></div>
          <div><p className="text-2xl font-bold">{pendingCount}</p><p className="text-sm text-gray-500">{t('leaves.pending')}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-lg"><CheckCircle className="w-6 h-6 text-green-600" /></div>
          <div><p className="text-2xl font-bold">{approvedCount}</p><p className="text-sm text-gray-500">{t('leaves.approved')}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-red-100 rounded-lg"><XCircle className="w-6 h-6 text-red-600" /></div>
          <div><p className="text-2xl font-bold">{rejectedCount}</p><p className="text-sm text-gray-500">{t('leaves.rejected')}</p></div>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'full_name', label: t('payroll.employee'), render: (v: string) => <Link to={'/hr/employees'} className="hover:text-primary-600 transition-colors">{v}</Link> },
          { key: 'leave_type', label: t('leaves.type'), render: (v) => typeLabels[v] || v },
          { key: 'start_date', label: t('leaves.from') },
          { key: 'end_date', label: t('leaves.to') },
          { key: 'days_count', label: t('leaves.days') },
          { key: 'status', label: t('common.status'), render: (v) => <span className={`badge ${statusColors[v] || ''}`}>{statusLabels[v] || v}</span> },
        ]}
        data={leaves}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('leaves.request')}>
        <div className="space-y-3">
          <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })} className="select-field w-full">
            <option value="annual">{t('leaves.annual')}</option><option value="sick">{t('leaves.sick')}</option><option value="emergency">{t('leaves.emergency')}</option><option value="personal">{t('leaves.personal')}</option>
          </select>
          <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="input-field w-full" placeholder={t('leaves.start_date')} />
          <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="input-field w-full" placeholder={t('leaves.end_date')} />
          <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-field w-full" placeholder={t('leaves.reason')} rows={3} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{t('leaves.submit')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
