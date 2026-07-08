import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', tax_number: '', notes: '' });

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    const res = await api.get('/suppliers?limit=50');
    setSuppliers(res.data.suppliers);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await api.put(`/suppliers/${editing.id}`, form); } else { await api.post('/suppliers', form); }
    setShowModal(false); setEditing(null);
    setForm({ name: '', phone: '', email: '', address: '', city: '', tax_number: '', notes: '' });
    fetchSuppliers();
  };

  const handleEdit = (s: any) => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', city: s.city || '', tax_number: s.tax_number || '', notes: s.notes || '' }); setShowModal(true); };
  const handleDelete = async (id: number) => { await api.delete(`/suppliers/${id}`); fetchSuppliers(); };

  return (
    <div>
      <PageHeader title={t('suppliers.title')} actions={<><button onClick={() => { setEditing(null); setForm({ name: '', phone: '', email: '', address: '', city: '', tax_number: '', notes: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('suppliers.add')}</button><PrintButton /></>} />

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('common.code')}</th><th className="table-header">{t('common.name')}</th><th className="table-header">{t('common.phone')}</th><th className="table-header">{t('common.city')}</th><th className="table-header text-left">{t('common.balance')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="text-center py-8">{t('common.loading')}</td></tr> : suppliers.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-500">{t('suppliers.no_suppliers')}</td></tr> : suppliers.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-500">{s.code}</td>
                  <td className="table-cell font-medium"><span className="font-bold">{s.name}</span></td>
                  <td className="table-cell" dir="ltr">{s.phone || '-'}</td>
                  <td className="table-cell">{s.city || '-'}</td>
                  <td className="table-cell text-left font-mono">{formatCurrency(s.current_balance)}</td>
                  <td className="table-cell"><div className="flex gap-1"><button onClick={() => handleEdit(s)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button><button onClick={() => setConfirmDelete(s.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('suppliers.edit') : t('suppliers.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">{t('common.phone')}</label><input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div><div><label className="block text-sm font-medium mb-1">{t('common.email')}</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">{t('common.address')}</label><input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" /></div><div><label className="block text-sm font-medium mb-1">{t('common.city')}</label><input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input-field" /></div></div>
          <div><label className="block text-sm font-medium mb-1">{t('common.tax_number')}</label><input type="text" value={form.tax_number} onChange={e => setForm({ ...form, tax_number: e.target.value })} className="input-field" /></div>
          <button type="submit" className="btn-primary w-full">{editing ? t('common.update') : t('common.add')}</button>
        </form>
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
