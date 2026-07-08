import { useState, useEffect } from 'react';
import { Building2, Plus, Pencil, Trash2, Star, StarOff } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

interface Company {
  id: number;
  name: string;
  name_en: string;
  is_active: number;
  is_default: number;
}

export default function CompaniesPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', name_en: '' });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/companies');
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleSubmit = async () => {
    if (!form.name) { toast.error(t('companies.name_required')); return; }
    try {
      if (editId) {
        await api.put(`/companies/${editId}`, form);
        toast.success(t('common.update'));
      } else {
        await api.post('/companies', form);
        toast.success(t('common.create'));
      }
      setShowModal(false);
      setEditId(null);
      setForm({ name: '', name_en: '' });
      fetchCompanies();
    } catch {
      toast.error(t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/companies/${id}`);
      toast.success(t('common.delete'));
      fetchCompanies();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.post(`/companies/${id}/set-default`);
      toast.success(t('companies.set_default'));
      fetchCompanies();
    } catch {
      toast.error(t('error.save'));
    }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('companies.title') }]} />
      <PageHeader title={t('companies.title')} subtitle={t('companies.subtitle')} actions={
        <><button onClick={() => { setEditId(null); setForm({ name: '', name_en: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('companies.add')}
        </button><PrintButton /></>
      } />

      <DataTable
        columns={[
          { key: 'name', label: t('companies.name_ar') },
          { key: 'name_en', label: t('companies.name_en') },
          { key: 'is_active', label: t('common.status'), render: (v) => v ? <span className="badge badge-success">{t('companies.active')}</span> : <span className="badge badge-danger">{t('companies.inactive')}</span> },
          { key: 'is_default', label: t('companies.default'), render: (v) => v ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <StarOff className="w-4 h-4 text-gray-300" /> },
          { key: 'actions', label: '', render: (_, row: Company) => (
            <div className="flex gap-2">
              {!row.is_default && (
                <button onClick={() => handleSetDefault(row.id)} className="p-1.5 hover:bg-yellow-50 rounded-lg text-yellow-600" title={t('companies.set_default')}>
                  <Star className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => { setEditId(row.id); setForm({ name: row.name, name_en: row.name_en || '' }); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500" title={t('common.edit')}>
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setConfirmDelete(row.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title={t('common.delete')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )},
        ]}
        data={companies}
        loading={loading}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? t('companies.edit') : t('companies.add')}>
        <div className="space-y-4">
          <input className="input-field" placeholder={t('companies.placeholder_ar')} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <input className="input-field" placeholder={t('companies.placeholder_en')} value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} />
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{editId ? t('common.update') : t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('companies.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
