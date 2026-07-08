import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import LocationPicker from '../../components/ui/LocationPicker';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', latitude: '', longitude: '', tax_number: '', credit_limit: '', notes: '' });
  const { t } = useTranslation();

  useEffect(() => { fetchClients(); }, [page]);

  const fetchClients = async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20' });
    if (search) params.append('search', search);
    const res = await api.get(`/clients?${params}`);
    setClients(res.data.clients);
    setTotal(res.data.total);
    setLoading(false);
  };

  const handleSearch = () => { setPage(1); fetchClients(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, credit_limit: parseFloat(form.credit_limit) || 0, latitude: form.latitude ? parseFloat(form.latitude) : undefined, longitude: form.longitude ? parseFloat(form.longitude) : undefined };
    if (editing) { await api.put(`/clients/${editing.id}`, data); } else { await api.post('/clients', data); }
    setShowModal(false); setEditing(null); setForm({ name: '', phone: '', email: '', address: '', city: '', latitude: '', longitude: '', tax_number: '', credit_limit: '', notes: '' });
    fetchClients();
  };

  const handleEdit = (client: any) => {
    setEditing(client);
    setForm({ name: client.name, phone: client.phone || '', email: client.email || '', address: client.address || '', city: client.city || '', latitude: client.latitude?.toString() || '', longitude: client.longitude?.toString() || '', tax_number: client.tax_number || '', credit_limit: client.credit_limit?.toString() || '0', notes: client.notes || '' });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/clients/${id}`);
    fetchClients();
  };

  const handleLocationChange = (lat: number, lng: number) => {
    setForm({ ...form, latitude: String(lat), longitude: String(lng) });
  };

  return (
    <div>
      <PageHeader title={t('clients.title')} actions={<><button onClick={() => { setEditing(null); setForm({ name: '', phone: '', email: '', address: '', city: '', latitude: '', longitude: '', tax_number: '', credit_limit: '', notes: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('clients.add')}</button><PrintButton /></>} />

      <div className="card">
        <div className="mb-4"><input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder={t('clients.search')} className="input-field" /></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('clients.code')}</th><th className="table-header">{t('common.name')}</th><th className="table-header">{t('clients.phone')}</th><th className="table-header">{t('clients.city')}</th><th className="table-header text-left">{t('clients.balance')}</th><th className="table-header">{t('clients.location')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8">{t('common.loading')}</td></tr> : clients.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-500">{t('clients.no_clients')}</td></tr> : clients.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-500">{c.code}</td>
                  <td className="table-cell font-medium"><span className="font-bold">{c.name}</span></td>
                  <td className="table-cell" dir="ltr">{c.phone || '-'}</td>
                  <td className="table-cell">{c.city || '-'}</td>
                  <td className="table-cell text-left font-mono"><Link to={`/sales/client-payments?client_id=${c.id}`} className="hover:text-primary-600 transition-colors">{formatCurrency(c.current_balance)}</Link></td>
                  <td className="table-cell">{c.latitude ? <MapPin className="w-4 h-4 text-primary-500" /> : '-'}</td>
                  <td className="table-cell"><div className="flex gap-1"><button onClick={() => handleEdit(c)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button><button onClick={() => setConfirmDelete(c.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('clients.edit') : t('clients.add')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('common.phone')}</label><input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('common.email')}</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('clients.city')}</label><input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input-field" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium mb-1">{t('common.address')}</label><input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" /></div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t('clients.latitude')} / {t('clients.longitude')}</label>
              <LocationPicker onLocationChange={handleLocationChange} />
            </div>
            <div><label className="block text-sm font-medium mb-1">{t('clients.tax_number')}</label><input type="text" value={form.tax_number} onChange={e => setForm({ ...form, tax_number: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('clients.credit_limit')}</label><input type="number" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} className="input-field" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium mb-1">{t('common.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          </div>
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
