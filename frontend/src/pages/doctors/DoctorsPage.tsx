import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Stethoscope, TrendingUp } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function DoctorsPage() {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', specialization: '', phone: '', email: '', address: '', latitude: '', longitude: '', clinic_name: '', visit_fee: '', commission_percentage: '', notes: '' });

  useEffect(() => { fetchDoctors(); fetchStats(); }, []);

  const fetchDoctors = async () => {
    const res = await api.get('/doctors?limit=50');
    setDoctors(res.data.doctors || []);
    setLoading(false);
  };
  const fetchStats = async () => { const res = await api.get('/doctors/stats'); setStats(res.data || []); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, visit_fee: parseFloat(form.visit_fee) || 0, commission_percentage: parseFloat(form.commission_percentage) || 0, latitude: form.latitude ? parseFloat(form.latitude) : null, longitude: form.longitude ? parseFloat(form.longitude) : null };
    if (editing) { await api.put(`/doctors/${editing.id}`, data); } else { await api.post('/doctors', data); }
    setShowModal(false); setEditing(null); setForm({ name: '', specialization: '', phone: '', email: '', address: '', latitude: '', longitude: '', clinic_name: '', visit_fee: '', commission_percentage: '', notes: '' });
    fetchDoctors(); fetchStats();
  };

  const handleEdit = (d: any) => {
    setEditing(d);
    setForm({ name: d.name, specialization: d.specialization || '', phone: d.phone || '', email: d.email || '', address: d.address || '', latitude: d.latitude?.toString() || '', longitude: d.longitude?.toString() || '', clinic_name: d.clinic_name || '', visit_fee: d.visit_fee?.toString() || '0', commission_percentage: d.commission_percentage?.toString() || '0', notes: d.notes || '' });
    setShowModal(true);
  };
  const handleDelete = async (id: number) => { await api.delete(`/doctors/${id}`); fetchDoctors(); fetchStats(); };

  return (
    <div>
      <PageHeader title={t('doctors.title')} subtitle={t('doctors.subtitle')} actions={<><button onClick={() => { setEditing(null); setForm({ name: '', specialization: '', phone: '', email: '', address: '', latitude: '', longitude: '', clinic_name: '', visit_fee: '', commission_percentage: '', notes: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('doctors.add')}</button><PrintButton /></>} />

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {stats.slice(0, 3).map((s: any) => (
            <div key={s.id} className="card flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-50 text-purple-600"><Stethoscope className="w-6 h-6" /></div>
              <div><p className="text-sm text-gray-500">{s.name}</p><p className="text-lg font-bold">{formatCurrency(s.total_sales || 0)}</p><p className="text-xs text-gray-400">{s.sale_count || 0} {t('doctors.invoice')}</p></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('common.name')}</th><th className="table-header">{t('doctors.specialization')}</th><th className="table-header">{t('doctors.clinic')}</th><th className="table-header">{t('doctors.phone')}</th><th className="table-header text-left">{t('doctors.commission')}</th><th className="table-header">{t('clients.location')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8">{t('common.loading')}</td></tr> : doctors.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-500">{t('doctors.no_doctors')}</td></tr> : doctors.map((d: any) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{d.name}</td>
                  <td className="table-cell"><span className="badge badge-info">{d.specialization || '-'}</span></td>
                  <td className="table-cell">{d.clinic_name || '-'}</td>
                  <td className="table-cell" dir="ltr">{d.phone || '-'}</td>
                  <td className="table-cell text-left">{d.commission_percentage}%</td>
                  <td className="table-cell">{d.latitude ? <MapPin className="w-4 h-4 text-primary-500" /> : '-'}</td>
                  <td className="table-cell"><div className="flex gap-1"><button onClick={() => handleEdit(d)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button><button onClick={() => setConfirmDelete(d.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('doctors.edit') : t('doctors.add')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.specialization')}</label><input type="text" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.phone')}</label><input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.email')}</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.clinic_name')}</label><input type="text" value={form.clinic_name} onChange={e => setForm({ ...form, clinic_name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.address')}</label><input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.latitude')}</label><input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.longitude')}</label><input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.visit_fee')}</label><input type="number" step="0.01" value={form.visit_fee} onChange={e => setForm({ ...form, visit_fee: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('doctors.commission')} %</label><input type="number" step="0.01" value={form.commission_percentage} onChange={e => setForm({ ...form, commission_percentage: e.target.value })} className="input-field" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium mb-1">{t('doctors.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? t('common.update') : t('common.add')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('doctors.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
