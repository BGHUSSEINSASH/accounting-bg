import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function DebitNotesPage() {
  const { t } = useTranslation();
  const [debitNotes, setDebitNotes] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [supplierFilter, setSupplierFilter] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', purchase_invoice: '', date: new Date().toISOString().split('T')[0], reason: '' });
  const [formItems, setFormItems] = useState([{ item_id: '', quantity: 1, unit_price: 0 }]);

  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => { fetchDebitNotes(); api.get('/suppliers/all').then(r => setSuppliers(r.data)); api.get('/items/all').then(r => setItems(r.data)); }, [page, supplierFilter]);

  const fetchDebitNotes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (supplierFilter) params.append('supplier_id', supplierFilter);
      const res = await api.get(`/debit-notes?${params}`);
      setDebitNotes(res.data.debit_notes || res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/debit-notes', {
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        purchase_invoice_id: form.purchase_invoice || undefined,
        debit_note_date: form.date,
        reason: form.reason,
        items: formItems.map(i => ({ item_id: parseInt(i.item_id), quantity: i.quantity, unit_price: i.unit_price })),
      });
      toast.success(t('common.save'));
      setShowAddModal(false);
      setForm({ supplier_id: '', purchase_invoice: '', date: new Date().toISOString().split('T')[0], reason: '' });
      setFormItems([{ item_id: '', quantity: 1, unit_price: 0 }]);
      fetchDebitNotes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const addItem = () => setFormItems([...formItems, { item_id: '', quantity: 1, unit_price: 0 }]);

  const openDetail = async (note: any) => {
    try {
      const res = await api.get(`/debit-notes/${note.id}`);
      setSelectedNote(res.data);
      setDetailItems(res.data.items || []);
    } catch {
      setSelectedNote(note);
      setDetailItems(note.items || []);
    }
    setShowDetailModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/debit-notes/${id}`);
      toast.success(t('common.save'));
      if (selectedNote?.id === id) setShowDetailModal(false);
      fetchDebitNotes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const columns = [
    { key: 'debit_note_number', label: t('debit_notes.number'), render: (v: string) => <span className="font-medium">{v || '-'}</span> },
    { key: 'date', label: t('debit_notes.date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'supplier_name', label: t('debit_notes.supplier') },
    { key: 'reason', label: t('debit_notes.reason'), render: (v: string) => <span className="text-gray-600 text-sm">{v || '-'}</span> },
    { key: 'total', label: t('debit_notes.total'), render: (v: number) => <span className="font-mono text-left block">{formatCurrency(v || 0)}</span> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('inventory.items'), path: '/inventory' }, { label: t('debit_notes.breadcrumb') }]} />
      <PageHeader title={t('debit_notes.title')} actions={
        <><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('debit_notes.new')}</button><PrintButton /></>
      } />

      <div className="mb-4">
        <select value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setPage(1); }} className="select-field w-56">
          <option value="">{t('debit_notes.all_suppliers')}</option>
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={debitNotes} loading={loading} page={page} total={total} limit={20} onPageChange={setPage} />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('debit_notes.new_title')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('debit_notes.supplier')} *</label><select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="select-field" required><option value="">{t('debit_notes.supplier')}</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('debit_notes.purchase_invoice')}</label><input type="text" value={form.purchase_invoice} onChange={e => setForm({ ...form, purchase_invoice: e.target.value })} className="input-field" placeholder={t('debit_notes.purchase_invoice_placeholder')} /></div>
            <div><label className="block text-sm font-medium mb-1">{t('debit_notes.date')}</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">{t('debit_notes.reason')}</label><textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-field" rows={2} placeholder={t('debit_notes.reason_placeholder')} /></div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50"><th className="table-header">{t('debit_notes.item')}</th><th className="table-header">{t('debit_notes.quantity')}</th><th className="table-header">{t('debit_notes.unit_price')}</th><th className="table-header text-left">{t('debit_notes.total')}</th></tr></thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx}>
                    <td className="table-cell"><select value={it.item_id} onChange={e => { const item = items.find(i => i.id === parseInt(e.target.value)); const newItems = [...formItems]; newItems[idx].item_id = e.target.value; if (item) newItems[idx].unit_price = item.purchase_price; setFormItems(newItems); }} className="select-field text-xs" required><option value="">{t('debit_notes.item')}</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></td>
                    <td className="table-cell"><input type="number" min={1} value={it.quantity} onChange={e => { const newItems = [...formItems]; newItems[idx].quantity = parseInt(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-20" required /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={it.unit_price} onChange={e => { const newItems = [...formItems]; newItems[idx].unit_price = parseFloat(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-24" required /></td>
                    <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addItem} className="btn-secondary text-sm">+ {t('debit_notes.add_item')}</button>
          <button type="submit" className="btn-primary w-full">{t('debit_notes.save')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedNote(null); setDetailItems([]); }} title={`${t('debit_notes.number')}: ${selectedNote?.debit_note_number || ''}`} size="lg">
        {selectedNote && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('debit_notes.date')}:</span> <span className="font-medium">{formatDate(selectedNote.date)}</span></div>
              <div><span className="text-gray-500">{t('debit_notes.supplier')}:</span> <span className="font-medium">{selectedNote.supplier_name || '-'}</span></div>
              <div><span className="text-gray-500">{t('debit_notes.purchase_invoice_label')}:</span> <span className="font-medium"><Link to={'/inventory/purchases'} className="hover:text-primary-600 transition-colors">{selectedNote.purchase_invoice || '-'}</Link></span></div>
              <div><span className="text-gray-500">{t('debit_notes.total')}:</span> <span className="font-medium font-mono">{formatCurrency(selectedNote.total || 0)}</span></div>
            </div>
            {selectedNote.reason && (
              <div className="text-sm"><span className="text-gray-500">{t('debit_notes.reason')}:</span> <p className="mt-1 text-gray-700">{selectedNote.reason}</p></div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-gray-50"><th className="table-header">{t('debit_notes.item')}</th><th className="table-header">{t('debit_notes.quantity')}</th><th className="table-header">{t('debit_notes.unit_price')}</th><th className="table-header text-left">{t('debit_notes.total')}</th></tr></thead>
                <tbody>
                  {detailItems.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-4 text-gray-400">{t('debit_notes.no_items')}</td></tr>
                  ) : detailItems.map((item: any, i: number) => (
                    <tr key={item.id || i} className="hover:bg-gray-50">
                      <td className="table-cell">{item.item_name || '-'}</td>
                      <td className="table-cell">{item.quantity}</td>
                      <td className="table-cell font-mono">{formatCurrency(item.unit_price)}</td>
                      <td className="table-cell text-left font-mono">{formatCurrency(item.quantity * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => setConfirmDelete(selectedNote.id)} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t('debit_notes.delete')}</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('debit_notes.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
