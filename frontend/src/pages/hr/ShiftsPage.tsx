import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Clock, Plus, Pencil, Trash2, CalendarDays } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import toast from 'react-hot-toast';

interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  is_active: number;
}

interface Assignment {
  id: number;
  user_id: number;
  user_name: string;
  shift_id: number;
  shift_name: string;
  start_date: string;
  end_date: string | null;
  is_active: number;
}

interface User {
  id: number;
  full_name: string;
}

const defaultShiftForm = { name: '', start_time: '', end_time: '', grace_minutes: 0 };
const defaultAssignmentForm = { user_id: 0, shift_id: 0, start_date: '', end_date: '' };

export default function ShiftsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'shifts' | 'assignments'>('shifts');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editShiftId, setEditShiftId] = useState<number | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<number | null>(null);
  const [shiftForm, setShiftForm] = useState(defaultShiftForm);
  const [assignmentForm, setAssignmentForm] = useState(defaultAssignmentForm);
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'shift' | 'assignment'} | null>(null);

  useEffect(() => {
    loadUsers();
    loadShifts();
    loadAssignments();
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [userFilter]);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch {
      setUsers([]);
    }
  };

  const loadShifts = async () => {
    try {
      const { data } = await api.get('/shifts');
      setShifts(Array.isArray(data) ? data : data.shifts || []);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    try {
      const params: any = {};
      if (userFilter) params.user_id = userFilter;
      const { data } = await api.get('/shifts/assignments', { params });
      setAssignments(data);
    } catch {
      toast.error(t('error.load'));
    }
  };

  const handleShiftSubmit = async () => {
    try {
      if (editShiftId) {
        await api.put(`/shifts/${editShiftId}`, shiftForm);
        toast.success(t('shifts.updated'));
      } else {
        await api.post('/shifts', shiftForm);
        toast.success(t('shifts.created'));
      }
      setShowShiftModal(false);
      setEditShiftId(null);
      setShiftForm(defaultShiftForm);
      loadShifts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleDeleteShift = async (id: number) => {
    try {
      await api.delete(`/shifts/${id}`);
      toast.success(t('shifts.deactivated'));
      loadShifts();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  const handleEditShift = (s: Shift) => {
    setEditShiftId(s.id);
    setShiftForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, grace_minutes: s.grace_minutes });
    setShowShiftModal(true);
  };

  const handleAssignmentSubmit = async () => {
    try {
      if (editAssignmentId) {
        await api.put(`/shifts/assignments/${editAssignmentId}`, assignmentForm);
        toast.success(t('shifts.assignment_updated'));
      } else {
        await api.post('/shifts/assignments', assignmentForm);
        toast.success(t('shifts.assignment_created'));
      }
      setShowAssignmentModal(false);
      setEditAssignmentId(null);
      setAssignmentForm(defaultAssignmentForm);
      loadAssignments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleDeactivateAssignment = async (id: number) => {
    try {
      await api.put(`/shifts/assignments/${id}`, { is_active: 0 });
      toast.success(t('shifts.assignment_deactivated'));
      loadAssignments();
    } catch {
      toast.error(t('shifts.deactivate_error'));
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await api.delete(`/shifts/assignments/${id}`);
      toast.success(t('shifts.assignment_deleted'));
      loadAssignments();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.shifts') }]} />
      <PageHeader title={t('shifts.title')} subtitle={t('shifts.subtitle')} actions={<PrintButton />} />

      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('shifts')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'shifts' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <Clock className="w-4 h-4 inline ml-1" />{t('shifts.tab_shifts')}
          </button>
          <button onClick={() => setTab('assignments')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'assignments' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <CalendarDays className="w-4 h-4 inline ml-1" />{t('shifts.tab_assignments')}
          </button>
        </div>
      </div>

      {tab === 'shifts' && (
        <>
          <div className="mb-4">
            <button onClick={() => { setEditShiftId(null); setShiftForm(defaultShiftForm); setShowShiftModal(true); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t('shifts.add')}
            </button>
          </div>
          <DataTable
            columns={[
              { key: 'name', label: t('common.name') },
              { key: 'start_time', label: t('shifts.start_time') },
              { key: 'end_time', label: t('shifts.end_time') },
              { key: 'grace_minutes', label: t('shifts.grace_minutes'), render: (v) => `${v} ${t('common.min')}` },
              { key: 'is_active', label: t('common.status'), render: (v) => v ? <span className="badge badge-success">{t('common.active')}</span> : <span className="badge badge-danger">{t('common.inactive')}</span> },
              {
                key: 'actions', label: '', render: (_, row) => (
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleEditShift(row); }} className="p-1.5 hover:bg-blue-100 rounded text-blue-500" title={t('common.edit')}><Pencil className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({id: row.id, type: 'shift'}); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ),
              },
            ]}
            data={shifts}
          />

          <Modal isOpen={showShiftModal} onClose={() => setShowShiftModal(false)} title={editShiftId ? t('shifts.edit') : t('shifts.add')}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('common.name')}</label>
                <input className="input-field" value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{t('shifts.start_time')}</label>
                  <input type="time" className="input-field" value={shiftForm.start_time} onChange={e => setShiftForm({...shiftForm, start_time: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{t('shifts.end_time')}</label>
                  <input type="time" className="input-field" value={shiftForm.end_time} onChange={e => setShiftForm({...shiftForm, end_time: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('shifts.grace_minutes_label')}</label>
                <input type="number" className="input-field" value={shiftForm.grace_minutes} onChange={e => setShiftForm({...shiftForm, grace_minutes: Number(e.target.value)})} />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setShowShiftModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
                <button onClick={handleShiftSubmit} className="btn-primary">{editShiftId ? t('common.update') : t('common.add')}</button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {tab === 'assignments' && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => { setEditAssignmentId(null); setAssignmentForm(defaultAssignmentForm); setShowAssignmentModal(true); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t('shifts.add_assignment')}
            </button>
            <select className="input-field w-48" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
              <option value="">{t('shifts.all_employees')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <DataTable
            columns={[
              { key: 'user_name', label: t('payroll.employee') },
              { key: 'shift_name', label: t('shifts.shift') },
              { key: 'start_date', label: t('contracts.start_date') },
              { key: 'end_date', label: t('contracts.end_date'), render: (v) => v || '—' },
              { key: 'is_active', label: t('common.status'), render: (v) => v ? <span className="badge badge-success">{t('common.active')}</span> : <span className="badge badge-danger">{t('common.inactive')}</span> },
              {
                key: 'actions', label: '', render: (_, row) => (
                  <div className="flex items-center gap-2">
                    {row.is_active ? (
                      <button onClick={(e) => { e.stopPropagation(); handleDeactivateAssignment(row.id); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('shifts.deactivate')}><Trash2 className="w-4 h-4" /></button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({id: row.id, type: 'assignment'}); }} className="p-1.5 hover:bg-red-100 rounded text-red-500" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ),
              },
            ]}
            data={assignments}
          />

          <Modal isOpen={showAssignmentModal} onClose={() => setShowAssignmentModal(false)} title={editAssignmentId ? t('shifts.edit_assignment') : t('shifts.add_assignment')}>
            <div className="space-y-4">
              <select className="input-field" value={assignmentForm.user_id} onChange={e => setAssignmentForm({...assignmentForm, user_id: Number(e.target.value)})}>
                <option value={0}>{t('shifts.select_employee')}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <select className="input-field" value={assignmentForm.shift_id} onChange={e => setAssignmentForm({...assignmentForm, shift_id: Number(e.target.value)})}>
                <option value={0}>{t('shifts.select_shift')}</option>
                {shifts.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{t('contracts.start_date')}</label>
                  <input type="date" className="input-field" value={assignmentForm.start_date} onChange={e => setAssignmentForm({...assignmentForm, start_date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{t('shifts.end_date_optional')}</label>
                  <input type="date" className="input-field" value={assignmentForm.end_date} onChange={e => setAssignmentForm({...assignmentForm, end_date: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setShowAssignmentModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
                <button onClick={handleAssignmentSubmit} className="btn-primary">{editAssignmentId ? t('common.update') : t('common.add')}</button>
              </div>
            </div>
          </Modal>
        </>
      )}
      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'shift') handleDeleteShift(confirmDelete.id);
          else if (confirmDelete?.type === 'assignment') handleDeleteAssignment(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('common.confirm_title')}
        message={t('common.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
