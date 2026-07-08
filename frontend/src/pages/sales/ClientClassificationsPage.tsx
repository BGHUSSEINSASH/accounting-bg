import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

export default function ClientClassificationsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', discount_percentage: 0, credit_limit: 0 });

  const fetch = async () => {
    try {
      const { data: res } = await api.get('/client-classifications');
      setData(Array.isArray(res) ? res : []);
    } catch { toast.error(t('error.load')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSubmit = async () => {
    if (!form.name) { toast.error(t('classification.name_required')); return; }
    try {
      if (editId) { await api.put(`/client-classifications/${editId}`, form); toast.success(t('classification.updated')); }
      else { await api.post('/client-classifications', form); toast.success(t('classification.added')); }
      setShowModal(false); setEditId(null); setForm({ name: '', discount_percentage: 0, credit_limit: 0 }); fetch();
    } catch { toast.error(t('error.save')); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/client-classifications/${id}`); toast.success(t('common.deleted')); fetch(); }
    catch { toast.error(t('error.delete')); }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.sales') }, { label: t('classification.title') }]} />
      <PageHeader title={t('classification.title')} subtitle={t('classification.subtitle')} actions={
        <><button onClick={() => { setEditId(null); setForm({ name: '', discount_percentage: 0, credit_limit: 0 }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('classification.add')}</button><PrintButton /></>
      } />
      <DataTable columns={[
        { key: 'name', label: t('classification.name_column') },
        { key: 'discount_percentage', label: t('classification.discount_percentage'), render: (v: number) => `${v}%` },
        { key: 'credit_limit', label: t('classification.credit_limit'), render: (v: number) => v.toLocaleString() + ' ريال' },
        { key: 'is_active', label: t('classification.status'), render: (v: number) => v ? <span className="badge badge-success">{t('classification.active')}</span> : <span className="badge badge-danger">{t('classification.inactive')}</span> },
        { key: 'actions', label: '', render: (_: any, row: any) => (
          <div className="flex gap-2">
            <button onClick={() => { setEditId(row.id); setForm({ name: row.name, discount_percentage: row.discount_percentage, credit_limit: row.credit_limit }); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-4 h-4 text-gray-500" /></button>
            <button onClick={() => setConfirmDelete(row.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
          </div>
        )},
      ]} data={data} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? t('classification.edit') : t('classification.add')}>
        <div className="space-y-4">
          <input className="input-field" placeholder={t('classification.placeholder')} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <label className="block text-sm text-gray-500">{t('classification.discount_percentage')}</label>
          <input className="input-field" type="number" value={form.discount_percentage} onChange={e => setForm({...form, discount_percentage: parseFloat(e.target.value) || 0})} />
          <label className="block text-sm text-gray-500">{t('classification.credit_limit')}</label>
          <input className="input-field" type="number" value={form.credit_limit} onChange={e => setForm({...form, credit_limit: parseFloat(e.target.value) || 0})} />
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('classification.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{editId ? t('classification.update') : t('classification.add_btn')}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('classification.delete_title')}
        message={t('classification.delete_message')}
        variant="danger"
      />
    </div>
  );
}
