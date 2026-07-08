import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Send, CheckCircle, XCircle, FileText, Trash2, Edit2, Eye } from 'lucide-react';
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

const statusColors: Record<string, string> = {
  draft: 'badge-gray',
  sent: 'badge-info',
  accepted: 'badge-success',
  rejected: 'badge-danger',
  converted: 'badge-primary',
};

export default function QuotationsPage() {
  const { t } = useTranslation();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], client_id: '', valid_until: '', notes: '' });
  const [formItems, setFormItems] = useState([{ item_id: '', quantity: 1, unit_price: 0 }]);

  const statusLabels: Record<string, string> = {
    draft: t('quotation.draft'),
    sent: t('quotation.sent'),
    accepted: t('quotation.accepted'),
    rejected: t('quotation.rejected'),
    converted: t('quotation.converted'),
  };

  useEffect(() => {
    fetchQuotations();
    api.get('/clients/all').then(r => setClients(r.data));
    api.get('/items/all').then(r => setAllItems(r.data));
  }, [page]);

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (statusFilter) params.append('status', statusFilter);
      const res = await api.get(`/quotations?${params}`);
      setQuotations(res.data.quotations || res.data);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!loading) { setPage(1); fetchQuotations(); } }, [statusFilter]);

  const handleViewDetail = async (quotation: any) => {
    try {
      const res = await api.get(`/quotations/${quotation.id}`);
      setSelectedQuotation(res.data);
      setShowDetailModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/quotations', {
        date: form.date,
        client_id: form.client_id ? parseInt(form.client_id) : null,
        valid_until: form.valid_until || null,
        notes: form.notes,
        items: formItems.map(i => ({ item_id: parseInt(i.item_id), quantity: i.quantity, unit_price: i.unit_price })),
      });
      toast.success(t('quotation.created'));
      setShowAddModal(false);
      setForm({ date: new Date().toISOString().split('T')[0], client_id: '', valid_until: '', notes: '' });
      setFormItems([{ item_id: '', quantity: 1, unit_price: 0 }]);
      fetchQuotations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const addFormItem = () => setFormItems([...formItems, { item_id: '', quantity: 1, unit_price: 0 }]);

  const calcTotal = () => formItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);

  const handleStatusUpdate = async (status: string) => {
    try {
      await api.put(`/quotations/${selectedQuotation.id}`, { status });
      toast.success(t('quotation.status_updated'));
      setShowDetailModal(false);
      fetchQuotations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleConvert = async () => {
    try {
      const res = await api.post(`/quotations/${selectedQuotation.id}/convert`);
      toast.success(`${t('quotation.converted')} #${res.data.invoice_number || res.data.invoice_id}`);
      setShowDetailModal(false);
      fetchQuotations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/quotations/${selectedQuotation.id}`);
      toast.success(t('quotation.deleted'));
      setShowDetailModal(false);
      fetchQuotations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.delete'));
    }
  };

  const columns = [
    { key: 'quote_number', label: t('quotation.number'), render: (v: string, row: any) => <Link to={`/sales/quotations?id=${row.id}`} className="hover:text-primary-600 transition-colors font-medium">{v}</Link> },
    { key: 'date', label: t('quotation.date'), render: (v: string) => formatDate(v) },
    { key: 'client_name', label: t('quotation.client'), render: (v: string) => <Link to={'/sales/clients'} className="hover:text-primary-600 transition-colors">{v || '-'}</Link> },
    { key: 'total', label: t('quotation.total'), render: (v: number) => <span className="font-mono">{formatCurrency(v)}</span> },
    { key: 'status', label: t('quotation.status'), render: (v: string) => <span className={`badge ${statusColors[v] || 'badge-info'}`}>{statusLabels[v] || v}</span> },
    { key: 'valid_until', label: t('quotation.valid_until'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'id', label: '', render: (_: any, row: any) => <button onClick={() => handleViewDetail(row)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-blue-500" /></button> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.sales'), path: '/sales' }, { label: t('quotation.title') }]} />
      <PageHeader title={t('quotation.title')} actions={<><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('quotation.new')}</button><PrintButton /></>} />

      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-field w-48">
          <option value="">{t('quotation.all')}</option>
          <option value="draft">{t('quotation.draft')}</option>
          <option value="sent">{t('quotation.sent')}</option>
          <option value="accepted">{t('quotation.accepted')}</option>
          <option value="rejected">{t('quotation.rejected')}</option>
          <option value="converted">{t('quotation.converted')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={quotations}
        loading={loading}
        page={page}
        total={total}
        limit={20}
        onPageChange={setPage}
      />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('quotation.new')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('quotation.date')} *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('quotation.client')}</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="select-field"><option value="">{t('common.select')}</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('quotation.valid_until')}</label><input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">{t('quotation.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50"><th className="table-header">{t('quotation.item')}</th><th className="table-header">{t('quotation.quantity')}</th><th className="table-header">{t('quotation.unit_price')}</th><th className="table-header text-left">{t('quotation.total')}</th></tr></thead>
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
          <button type="button" onClick={addFormItem} className="btn-secondary text-sm">{t('quotation.add_item')}</button>
          <div className="text-left font-semibold">{t('quotation.total')}: {formatCurrency(calcTotal())}</div>
          <button type="submit" className="btn-primary w-full">{t('common.save')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`${t('quotation.title')} #${selectedQuotation?.quote_number || ''}`} size="lg">
        {selectedQuotation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('quotation.detail_date')}</span> <span className="font-medium">{formatDate(selectedQuotation.date)}</span></div>
              <div><span className="text-gray-500">{t('quotation.detail_client')}</span> <span className="font-medium">{selectedQuotation.client_name || '-'}</span></div>
              {selectedQuotation.valid_until && <div><span className="text-gray-500">{t('quotation.detail_valid_until')}</span> <span className="font-medium">{formatDate(selectedQuotation.valid_until)}</span></div>}
              <div><span className="text-gray-500">{t('quotation.detail_status')}</span> <span className={`badge ${statusColors[selectedQuotation.status] || 'badge-info'}`}>{statusLabels[selectedQuotation.status] || selectedQuotation.status}</span></div>
            </div>
            {selectedQuotation.notes && <div className="text-sm"><span className="text-gray-500">{t('quotation.detail_notes')}</span> <p className="mt-1">{selectedQuotation.notes}</p></div>}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="table-header">{t('quotation.item')}</th><th className="table-header">{t('quotation.quantity')}</th><th className="table-header">{t('quotation.unit_price')}</th><th className="table-header text-left">{t('quotation.total')}</th></tr></thead>
                <tbody>
                  {(selectedQuotation.items || []).map((it: any, idx: number) => (
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
            <div className="text-left text-lg font-bold">{t('quotation.total')}: {formatCurrency(selectedQuotation.total)}</div>
            <div className="flex gap-2 pt-2 border-t">
              {selectedQuotation.status === 'draft' && (
                <>
                  <button onClick={() => handleStatusUpdate('sent')} className="btn-primary flex items-center gap-1 text-sm"><Send className="w-4 h-4" /> {t('quotation.send')}</button>
                  <button onClick={() => { setShowDetailModal(false); toast('التعديل عبر فتح سجل وتعديله - قيد التطوير'); }} className="btn-secondary flex items-center gap-1 text-sm"><Edit2 className="w-4 h-4" /> {t('quotation.edit')}</button>
                  <button onClick={() => setConfirmDelete(true)} className="btn-secondary flex items-center gap-1 text-sm text-red-600"><Trash2 className="w-4 h-4" /> {t('quotation.delete')}</button>
                </>
              )}
              {selectedQuotation.status === 'sent' && (
                <>
                  <button onClick={handleConvert} className="btn-primary flex items-center gap-1 text-sm"><FileText className="w-4 h-4" /> {t('quotation.convert_to_invoice')}</button>
                  <button onClick={() => handleStatusUpdate('accepted')} className="btn-secondary flex items-center gap-1 text-sm text-green-600"><CheckCircle className="w-4 h-4" /> {t('quotation.accept')}</button>
                  <button onClick={() => handleStatusUpdate('rejected')} className="btn-secondary flex items-center gap-1 text-sm text-red-600"><XCircle className="w-4 h-4" /> {t('quotation.reject')}</button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { handleDelete(); setConfirmDelete(false); }}
        title={t('quotation.delete_title')}
        message={t('quotation.delete_message')}
        variant="danger"
      />
    </div>
  );
}
