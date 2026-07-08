import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, X, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InvoicePrintModal from '../../components/printing/InvoicePrintModal';
import { formatDate, formatCurrency, getStatusBadgeClass, getStatusText } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function PurchasesPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [printInvoice, setPrintInvoice] = useState<any>(null);
  const [form, setForm] = useState({ supplier_id: '', invoice_date: new Date().toISOString().split('T')[0], discount: 0, tax: 0, payment_status: 'unpaid', notes: '' });
  const [formItems, setFormItems] = useState([{ item_id: '', quantity: 1, unit_price: 0 }]);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { fetchInvoices(); api.get('/suppliers/all').then(r => setSuppliers(r.data)); api.get('/items/all').then(r => setItems(r.data)); }, [page, dateFrom, dateTo, statusFilter]);

  const fetchInvoices = async () => {
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (statusFilter) params.set('payment_status', statusFilter);
      const res = await api.get(`/purchases?${params}`);
      setInvoices(res.data.invoices || []);
      setTotal(res.data.total || 0);
    } catch { toast.error(t('error.load')); }
    setLoading(false);
  };

  const clearFilters = () => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setPage(1); };

  const handlePrint = async (id: number) => {
    try {
      const res = await api.get(`/purchases/${id}/print`);
      setPrintInvoice(res.data);
    } catch { }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form, supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        items: formItems.map(i => ({ item_id: parseInt(i.item_id), quantity: i.quantity, unit_price: i.unit_price }))
      };
      if (editing) {
        await api.put('/purchases/' + editing.id, payload);
        toast.success(t('common.save'));
      } else {
        await api.post('/purchases', payload);
        toast.success(t('common.save'));
      }
      setShowModal(false);
      setEditing(null);
      setForm({ supplier_id: '', invoice_date: new Date().toISOString().split('T')[0], discount: 0, tax: 0, payment_status: 'unpaid', notes: '' });
      setFormItems([{ item_id: '', quantity: 1, unit_price: 0 }]);
      fetchInvoices();
    } catch { toast.error(t('error.save')); }
  };

  const handleEdit = (inv: any) => {
    setEditing(inv);
    setForm({
      supplier_id: inv.supplier_id?.toString() || '',
      invoice_date: inv.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      discount: inv.discount || 0,
      tax: inv.tax || 0,
      payment_status: inv.payment_status || 'unpaid',
      notes: inv.notes || ''
    });
    setFormItems(inv.items?.length > 0 ? inv.items.map((i: any) => ({
      item_id: i.item_id?.toString() || '',
      quantity: i.quantity || 1,
      unit_price: i.unit_price || 0
    })) : [{ item_id: '', quantity: 1, unit_price: 0 }]);
    setShowModal(true);
  };

  const handleDeleteClick = (id: number) => {
    setDeletingId(id);
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await api.delete('/purchases/' + deletingId);
      toast.success(t('common.save'));
      setConfirmDelete(false);
      setDeletingId(null);
      fetchInvoices();
    } catch { toast.error(t('error.delete')); }
  };

  const addItem = () => setFormItems([...formItems, { item_id: '', quantity: 1, unit_price: 0 }]);

  return (
    <div>
      <PageHeader title={t('purchases.title')} actions={<><button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('purchases.new_invoice')}</button><PrintButton /></>} />

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div><label className="text-xs text-gray-500 block mb-1">{t('common.date')} {t('common.from')}</label><input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field text-xs" /></div>
          <div><label className="text-xs text-gray-500 block mb-1">{t('common.to')}</label><input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field text-xs" /></div>
          <div><label className="text-xs text-gray-500 block mb-1">{t('common.status')}</label><select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="select-field text-xs"><option value="">{t('common.all')}</option><option value="paid">{t('purchases.paid')}</option><option value="unpaid">{t('purchases.unpaid')}</option><option value="partial">{t('purchases.partial')}</option></select></div>
          {(dateFrom || dateTo || statusFilter) && <button onClick={clearFilters} className="btn-secondary text-xs self-end"><X className="w-3 h-3" /></button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('purchases.invoice_number')}</th><th className="table-header">{t('common.date')}</th><th className="table-header">{t('purchases.supplier')}</th><th className="table-header text-left">{t('purchases.total')}</th><th className="table-header">{t('common.status')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="text-center py-8">{t('common.loading')}</td></tr> : invoices.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">{t('purchases.no_invoices')}</td></tr>
              ) : invoices.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium"><Link to={`/inventory/purchases?id=${inv.id}`} className="hover:text-primary-600 transition-colors">{inv.invoice_number}</Link></td>
                  <td className="table-cell">{formatDate(inv.invoice_date)}</td>
                  <td className="table-cell"><Link to={'/sales/suppliers'} className="hover:text-primary-600 transition-colors">{inv.supplier_name || '-'}</Link></td>
                  <td className="table-cell text-left font-mono">{formatCurrency(inv.total)}</td>
                  <td className="table-cell"><span className={`badge ${getStatusBadgeClass(inv.payment_status)}`}>{getStatusText(inv.payment_status)}</span></td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handlePrint(inv.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" title={t('common.print')}><Printer className="w-4 h-4" /></button>
                      <button onClick={() => handleEdit(inv)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title={t('common.edit')}><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteClick(inv.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? t('purchases.edit_invoice') : t('purchases.new')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('common.date')}</label><input type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('purchases.supplier')}</label><select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="select-field"><option value="">{t('purchases.select')}</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50"><th className="table-header">{t('purchases.item')}</th><th className="table-header">{t('purchases.quantity')}</th><th className="table-header">{t('purchases.unit_price')}</th><th className="table-header text-left">{t('purchases.total')}</th></tr></thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx}>
                    <td className="table-cell"><select value={it.item_id} onChange={e => { const item = items.find(i => i.id === parseInt(e.target.value)); const newItems = [...formItems]; newItems[idx].item_id = e.target.value; if (item) newItems[idx].unit_price = item.purchase_price; setFormItems(newItems); }} className="select-field text-xs" required><option value="">{t('purchases.select')}</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></td>
                    <td className="table-cell"><input type="number" min={1} value={it.quantity} onChange={e => { const newItems = [...formItems]; newItems[idx].quantity = parseInt(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-20" required /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={it.unit_price} onChange={e => { const newItems = [...formItems]; newItems[idx].unit_price = parseFloat(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-24" required /></td>
                    <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addItem} className="btn-secondary text-sm">+ {t('purchases.add_item')}</button>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('purchases.discount')}</label><input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('purchases.tax')}</label><input type="number" value={form.tax} onChange={e => setForm({ ...form, tax: parseFloat(e.target.value) || 0 })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('purchases.payment_status')}</label><select value={form.payment_status} onChange={e => setForm({ ...form, payment_status: e.target.value })} className="select-field"><option value="unpaid">{t('purchases.unpaid')}</option><option value="paid">{t('purchases.paid')}</option><option value="partial">{t('purchases.partial')}</option></select></div>
          </div>
          <div className="flex justify-end gap-4 p-3 bg-gray-50 rounded-lg text-sm">
            <span>{t('purchases.subtotal')}: <strong>{formatCurrency(formItems.reduce((s, i) => s + i.quantity * i.unit_price, 0))}</strong></span>
            <span>{t('purchases.tax')}: <strong>{formatCurrency(Number(form.tax))}</strong></span>
            <span>{t('purchases.discount')}: <strong>{formatCurrency(Number(form.discount))}</strong></span>
            <span className="text-primary-600 font-bold">{t('purchases.grand_total')}: <strong>{formatCurrency(formItems.reduce((s, i) => s + i.quantity * i.unit_price, 0) + Number(form.tax) - Number(form.discount))}</strong></span>
          </div>
          <button type="submit" className="btn-primary w-full">{t('common.save')}</button>
        </form>
      </Modal>

      <ConfirmDialog isOpen={confirmDelete} onClose={() => { setConfirmDelete(false); setDeletingId(null); }} onConfirm={handleDeleteConfirm} title={t('purchases.delete_confirm_title')} message={t('purchases.delete_confirm_msg')} confirmText={t('purchases.delete_confirm')} cancelText={t('purchases.cancel')} />
      <InvoicePrintModal
        isOpen={printInvoice !== null}
        onClose={() => setPrintInvoice(null)}
        data={printInvoice}
        type="purchases"
      />
    </div>
  );
}
