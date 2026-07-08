import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';
import PrintButton from '../../components/ui/PrintButton';

export default function ItemsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', name_en: '', category: '', unit: 'piece', purchase_price: '', selling_price: '', current_quantity: '', min_quantity: '5', max_quantity: '100', barcode: '' });

  useEffect(() => { fetchItems(); }, [page]);

  const fetchItems = async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20' });
    if (search) params.append('search', search);
    const res = await api.get(`/items?${params}`);
    setItems(res.data.items || []);
    setTotal(res.data.total || 0);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, purchase_price: parseFloat(form.purchase_price) || 0, selling_price: parseFloat(form.selling_price) || 0, current_quantity: parseInt(form.current_quantity) || 0, min_quantity: parseInt(form.min_quantity) || 5, max_quantity: parseInt(form.max_quantity) || 100 };
    if (editing) { await api.put(`/items/${editing.id}`, data); } else { await api.post('/items', data); }
    setShowModal(false); setEditing(null);
    setForm({ name: '', name_en: '', category: '', unit: 'piece', purchase_price: '', selling_price: '', current_quantity: '', min_quantity: '5', max_quantity: '100', barcode: '' });
    fetchItems();
  };

  const handleEdit = (item: any) => {
    setEditing(item);
    setForm({ name: item.name, name_en: item.name_en || '', category: item.category || '', unit: item.unit, purchase_price: item.purchase_price.toString(), selling_price: item.selling_price.toString(), current_quantity: item.current_quantity.toString(), min_quantity: item.min_quantity.toString(), max_quantity: item.max_quantity.toString(), barcode: item.barcode || '' });
    setShowModal(true);
  };
  const handleDelete = async (id: number) => { await api.delete(`/items/${id}`); fetchItems(); };

  return (
    <div>
      <PageHeader title={t('inventory.items')} actions={<><button onClick={() => { setEditing(null); setForm({ name: '', name_en: '', category: '', unit: 'piece', purchase_price: '', selling_price: '', current_quantity: '', min_quantity: '5', max_quantity: '100', barcode: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('inventory.add_item')}</button><PrintButton /></>} />

      <div className="card">
        <div className="mb-4"><input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchItems()} placeholder={t('items.search_placeholder')} className="input-field" /></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('common.code')}</th><th className="table-header">{t('common.name')}</th><th className="table-header">{t('items.category')}</th><th className="table-header">{t('items.unit')}</th><th className="table-header text-left">{t('inventory.stock')}</th><th className="table-header text-left">{t('items.min_quantity')}</th><th className="table-header text-left">{t('items.purchase_price')}</th><th className="table-header text-left">{t('items.selling_price')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="text-center py-8">{t('common.loading')}</td></tr> : items.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-gray-500">{t('items.no_items')}</td></tr> : items.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-500">{item.code}</td>
                  <td className="table-cell font-medium"><button onClick={() => handleEdit(item)} className="hover:text-primary-600 transition-colors text-right">{item.name}</button>{item.current_quantity <= item.min_quantity && <AlertTriangle className="w-3 h-3 text-red-500 inline mr-1" />}</td>
                  <td className="table-cell"><span className="badge badge-info">{item.category || '-'}</span></td>
                  <td className="table-cell">{item.unit}</td>
                  <td className={`table-cell text-left font-mono ${item.current_quantity <= item.min_quantity ? 'text-red-600 font-bold' : ''}`}>{item.current_quantity}</td>
                  <td className="table-cell text-left">{item.min_quantity}</td>
                  <td className="table-cell text-left">{formatCurrency(item.purchase_price)}</td>
                  <td className="table-cell text-left">{formatCurrency(item.selling_price)}</td>
                  <td className="table-cell"><div className="flex gap-1"><button onClick={() => handleEdit(item)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button><button onClick={() => setConfirmDelete(item.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('inventory.edit_item') : t('inventory.add_item')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.name_en')}</label><input type="text" value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.category')}</label><input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.unit')}</label><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="select-field"><option value="piece">{t('items.unit_piece')}</option><option value="box">{t('items.unit_box')}</option><option value="carton">{t('items.unit_carton')}</option><option value="kg">{t('items.unit_kg')}</option><option value="liter">{t('items.unit_liter')}</option><option value="meter">{t('items.unit_meter')}</option></select></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.purchase_price')}</label><input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.selling_price')}</label><input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.current_quantity')}</label><input type="number" value={form.current_quantity} onChange={e => setForm({ ...form, current_quantity: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.barcode')}</label><input type="text" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.min_quantity')}</label><input type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('items.max_quantity')}</label><input type="number" value={form.max_quantity} onChange={e => setForm({ ...form, max_quantity: e.target.value })} className="input-field" /></div>
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
