import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, Trash2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function CreditNotesPage() {
  const { t } = useTranslation();
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [clientFilter, setClientFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [clientInvoices, setClientInvoices] = useState<any[]>([]);
  const [form, setForm] = useState({ client_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '' });
  const [formItems, setFormItems] = useState([{ item_id: '', quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    fetchCreditNotes();
    api.get('/clients/all').then(r => setClients(r.data));
    api.get('/items/all').then(r => setAllItems(r.data));
  }, [page]);

  const fetchCreditNotes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (clientFilter) params.append('client_id', clientFilter);
      const res = await api.get(`/credit-notes?${params}`);
      setCreditNotes(res.data.credit_notes || res.data);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!loading) { setPage(1); fetchCreditNotes(); } }, [clientFilter]);

  useEffect(() => {
    if (form.client_id) {
      api.get(`/sales?client_id=${form.client_id}`).then(r => setClientInvoices(r.data.invoices || r.data)).catch(() => setClientInvoices([]));
    } else {
      setClientInvoices([]);
    }
  }, [form.client_id]);

  const handleViewDetail = async (note: any) => {
    try {
      const res = await api.get(`/credit-notes/${note.id}`);
      setSelectedNote(res.data);
      setShowDetailModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/credit-notes', {
        client_id: form.client_id ? parseInt(form.client_id) : null,
        invoice_id: form.invoice_id ? parseInt(form.invoice_id) : null,
        date: form.date,
        reason: form.reason,
        items: formItems.map(i => ({ item_id: parseInt(i.item_id), quantity: i.quantity, unit_price: i.unit_price })),
      });
      toast.success(t('credit_note.created'));
      setShowAddModal(false);
      setForm({ client_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '' });
      setFormItems([{ item_id: '', quantity: 1, unit_price: 0 }]);
      fetchCreditNotes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const addFormItem = () => setFormItems([...formItems, { item_id: '', quantity: 1, unit_price: 0 }]);

  const calcTotal = () => formItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);

  const handleDelete = async () => {
    try {
      await api.delete(`/credit-notes/${selectedNote.id}`);
      toast.success(t('credit_note.deleted'));
      setShowDetailModal(false);
      fetchCreditNotes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.delete'));
    }
  };

  const columns = [
    { key: 'credit_note_number', label: t('credit_note.number') },
    { key: 'date', label: t('credit_note.date'), render: (v: string) => formatDate(v) },
    { key: 'client_name', label: t('credit_note.client') },
    { key: 'reason', label: t('credit_note.reason') },
    { key: 'total', label: t('credit_note.total'), render: (v: number) => <span className="font-mono">{formatCurrency(v)}</span> },
    { key: 'id', label: '', render: (_: any, row: any) => <button onClick={() => handleViewDetail(row)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-blue-500" /></button> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.sales'), path: '/sales' }, { label: t('credit_note.title') }]} />
      <PageHeader title={t('credit_note.title')} actions={<><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('credit_note.new')}</button><PrintButton /></>} />

      <div className="mb-4">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="select-field w-48">
          <option value="">{t('credit_note.all_clients')}</option>
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={creditNotes}
        loading={loading}
        page={page}
        total={total}
        limit={20}
        onPageChange={setPage}
      />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('credit_note.new')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('credit_note.client')} *</label><select value={form.client_id} onChange={e => { setForm({ ...form, client_id: e.target.value, invoice_id: '' }); }} className="select-field" required><option value="">{t('common.select')}</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('credit_note.invoice')}</label><select value={form.invoice_id} onChange={e => setForm({ ...form, invoice_id: e.target.value })} className="select-field" disabled={!form.client_id}><option value="">{t('credit_note.select_optional')}</option>{clientInvoices.map((inv: any) => <option key={inv.id} value={inv.id}>{inv.invoice_number} - {formatCurrency(inv.total)}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('credit_note.date')} *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">{t('credit_note.reason')}</label><textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-field" rows={2} required /></div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50"><th className="table-header">{t('common.item')}</th><th className="table-header">{t('common.quantity')}</th><th className="table-header">{t('credit_note.unit_price')}</th><th className="table-header text-left">{t('credit_note.total')}</th></tr></thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx}>
                    <td className="table-cell"><select value={it.item_id} onChange={e => { const item = allItems.find(i => i.id === parseInt(e.target.value)); const newItems = [...formItems]; newItems[idx].item_id = e.target.value; if (item) newItems[idx].unit_price = item.selling_price; setFormItems(newItems); }} className="select-field text-xs" required><option value="">{t('common.select')}</option>{allItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></td>
                    <td className="table-cell"><input type="number" min={1} value={it.quantity} onChange={e => { const newItems = [...formItems]; newItems[idx].quantity = parseInt(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-20" required /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={it.unit_price} onChange={e => { const newItems = [...formItems]; newItems[idx].unit_price = parseFloat(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-24" required /></td>
                    <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addFormItem} className="btn-secondary text-sm">{t('credit_note.add_item')}</button>
          <div className="text-left font-semibold">{t('credit_note.total')}: {formatCurrency(calcTotal())}</div>
          <button type="submit" className="btn-primary w-full">{t('credit_note.save')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`${t('credit_note.title')} #${selectedNote?.credit_note_number || ''}`} size="lg">
        {selectedNote && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('credit_note.detail_date')}</span> <span className="font-medium">{formatDate(selectedNote.date)}</span></div>
              <div><span className="text-gray-500">{t('credit_note.detail_client')}</span> <span className="font-medium">{selectedNote.client_name || '-'}</span></div>
              {selectedNote.invoice_number && <div><span className="text-gray-500">{t('credit_note.detail_invoice')}</span> <span className="font-medium"><Link to={'/sales/invoices'} className="hover:text-primary-600 transition-colors">{selectedNote.invoice_number}</Link></span></div>}
              {selectedNote.reason && <div className="col-span-2"><span className="text-gray-500">{t('credit_note.detail_reason')}</span> <p className="mt-1">{selectedNote.reason}</p></div>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="table-header">{t('common.item')}</th><th className="table-header">{t('common.quantity')}</th><th className="table-header">{t('credit_note.unit_price')}</th><th className="table-header text-left">{t('credit_note.total')}</th></tr></thead>
                <tbody>
                  {(selectedNote.items || []).map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td className="table-cell">{it.item_name || it.item?.name}</td>
                      <td className="table-cell">{it.quantity}</td>
                      <td className="table-cell">{formatCurrency(it.unit_price)}</td>
                      <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-left text-lg font-bold">{t('credit_note.total')}: {formatCurrency(selectedNote.total)}</div>
            <div className="flex gap-2 pt-2 border-t">
              <button onClick={() => setConfirmDelete(true)} className="btn-secondary flex items-center gap-1 text-sm text-red-600"><Trash2 className="w-4 h-4" /> {t('common.delete')}</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { handleDelete(); setConfirmDelete(false); }}
        title={t('credit_note.delete_title')}
        message={t('credit_note.delete_message')}
        variant="danger"
      />
    </div>
  );
}
