import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, CheckCircle, XCircle, RefreshCw, Trash2 } from 'lucide-react';
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
  pending: 'badge-warning',
  approved: 'badge-success',
  received: 'badge-info',
  cancelled: 'badge-danger',
};

export default function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [form, setForm] = useState({ supplier_id: '', date: new Date().toISOString().split('T')[0], expected_date: '', notes: '' });
  const [formItems, setFormItems] = useState([{ item_id: '', quantity: 1, unit_price: 0 }]);
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'cancel' | 'delete'} | null>(null);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('purchase_orders.status_pending'),
      approved: t('purchase_orders.status_approved'),
      received: t('purchase_orders.status_received'),
      cancelled: t('purchase_orders.status_cancelled'),
    };
    return labels[status] || status;
  };

  useEffect(() => {
    fetchOrders();
    api.get('/suppliers/all').then(r => setSuppliers(r.data));
    api.get('/items/all').then(r => setAllItems(r.data));
  }, [page]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (statusFilter) params.append('status', statusFilter);
      const res = await api.get(`/purchase-orders?${params}`);
      setOrders(res.data.orders || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!loading) { setPage(1); fetchOrders(); } }, [statusFilter]);

  const handleViewDetail = async (order: any) => {
    try {
      const res = await api.get(`/purchase-orders/${order.id}`);
      setSelectedOrder(res.data);
      setShowDetailModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/purchase-orders', {
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        order_date: form.date,
        expected_date: form.expected_date || null,
        notes: form.notes,
        items: formItems.map(i => ({ item_id: parseInt(i.item_id), quantity: i.quantity, unit_price: i.unit_price })),
      });
      toast.success(t('common.save'));
      setShowAddModal(false);
      setForm({ supplier_id: '', date: new Date().toISOString().split('T')[0], expected_date: '', notes: '' });
      setFormItems([{ item_id: '', quantity: 1, unit_price: 0 }]);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const addFormItem = () => setFormItems([...formItems, { item_id: '', quantity: 1, unit_price: 0 }]);

  const calcSubtotal = () => formItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);

  const handleApprove = async () => {
    try {
      await api.put(`/purchase-orders/${selectedOrder.id}`, { status: 'approved' });
      toast.success(t('common.save'));
      setShowDetailModal(false);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleReceive = async () => {
    try {
      await api.post(`/purchase-orders/${selectedOrder.id}/receive`);
      toast.success(t('common.save'));
      setShowDetailModal(false);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleCancel = async () => {
    try {
      await api.put(`/purchase-orders/${selectedOrder.id}`, { status: 'cancelled' });
      toast.success(t('common.save'));
      setShowDetailModal(false);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/purchase-orders/${selectedOrder.id}`);
      toast.success(t('common.save'));
      setShowDetailModal(false);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.delete'));
    }
  };

  const columns = [
    { key: 'order_number', label: t('purchase_orders.order_number') },
    { key: 'date', label: t('purchase_orders.date'), render: (v: string) => formatDate(v) },
    { key: 'supplier_name', label: t('purchase_orders.supplier'), render: (v: string) => <Link to={'/sales/suppliers'} className="hover:text-primary-600 transition-colors">{v || '-'}</Link> },
    { key: 'total', label: t('purchase_orders.total'), render: (v: number) => <span className="font-mono">{formatCurrency(v)}</span> },
    { key: 'status', label: t('purchase_orders.status'), render: (v: string) => <span className={`badge ${statusColors[v] || 'badge-info'}`}>{getStatusLabel(v)}</span> },
    { key: 'id', label: '', render: (_: any, row: any) => <button onClick={() => handleViewDetail(row)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-blue-500" /></button> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('inventory.items'), path: '/inventory' }, { label: t('purchase_orders.breadcrumb') }]} />
      <PageHeader title={t('purchase_orders.title')} actions={<><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('purchase_orders.new')}</button><PrintButton /></>} />

      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-field w-48">
          <option value="">{t('purchase_orders.all_statuses')}</option>
          <option value="pending">{t('purchase_orders.status_pending')}</option>
          <option value="approved">{t('purchase_orders.status_approved')}</option>
          <option value="received">{t('purchase_orders.status_received')}</option>
          <option value="cancelled">{t('purchase_orders.status_cancelled')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        page={page}
        total={total}
        limit={20}
        onPageChange={setPage}
      />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('purchase_orders.new')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('purchase_orders.date')} *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('purchase_orders.supplier')}</label><select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="select-field"><option value="">{t('purchase_orders.select')}</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('purchase_orders.expected_date')}</label><input type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">{t('purchase_orders.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50"><th className="table-header">{t('purchase_orders.item')}</th><th className="table-header">{t('purchase_orders.quantity')}</th><th className="table-header">{t('purchase_orders.unit_price')}</th><th className="table-header text-left">{t('purchase_orders.total')}</th></tr></thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx}>
                    <td className="table-cell"><select value={it.item_id} onChange={e => { const item = allItems.find(i => i.id === parseInt(e.target.value)); const newItems = [...formItems]; newItems[idx].item_id = e.target.value; if (item) newItems[idx].unit_price = item.purchase_price; setFormItems(newItems); }} className="select-field text-xs" required><option value="">{t('purchase_orders.select')}</option>{allItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></td>
                    <td className="table-cell"><input type="number" min={1} value={it.quantity} onChange={e => { const newItems = [...formItems]; newItems[idx].quantity = parseInt(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-20" required /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={it.unit_price} onChange={e => { const newItems = [...formItems]; newItems[idx].unit_price = parseFloat(e.target.value) || 0; setFormItems(newItems); }} className="input-field text-xs w-24" required /></td>
                    <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addFormItem} className="btn-secondary text-sm">+ {t('purchase_orders.add_item')}</button>
          <div className="text-left font-semibold">{t('purchase_orders.subtotal')}: {formatCurrency(calcSubtotal())}</div>
          <button type="submit" className="btn-primary w-full">{t('purchase_orders.save')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`${t('purchase_orders.order_number')} #${selectedOrder?.order_number || ''}`} size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('purchase_orders.date')}:</span> <span className="font-medium">{formatDate(selectedOrder.date)}</span></div>
              <div><span className="text-gray-500">{t('purchase_orders.supplier')}:</span> <span className="font-medium">{selectedOrder.supplier_name || '-'}</span></div>
              {selectedOrder.expected_date && <div><span className="text-gray-500">{t('purchase_orders.expected_date')}:</span> <span className="font-medium">{formatDate(selectedOrder.expected_date)}</span></div>}
              <div><span className="text-gray-500">{t('purchase_orders.status')}:</span> <span className={`badge ${statusColors[selectedOrder.status] || 'badge-info'}`}>{getStatusLabel(selectedOrder.status)}</span></div>
            </div>
            {selectedOrder.notes && <div className="text-sm"><span className="text-gray-500">{t('purchase_orders.notes')}:</span> <p className="mt-1">{selectedOrder.notes}</p></div>}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="table-header">{t('purchase_orders.item')}</th><th className="table-header">{t('purchase_orders.quantity')}</th><th className="table-header">{t('purchase_orders.unit_price')}</th><th className="table-header text-left">{t('purchase_orders.total')}</th></tr></thead>
                <tbody>
                  {(selectedOrder.items || []).map((it: any, idx: number) => (
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
            <div className="text-left text-lg font-bold">{t('purchase_orders.total')}: {formatCurrency(selectedOrder.total)}</div>
            <div className="flex gap-2 pt-2 border-t">
              {selectedOrder.status === 'pending' && (
                <>
                  <button onClick={handleApprove} className="btn-primary flex items-center gap-1 text-sm"><CheckCircle className="w-4 h-4" /> {t('purchase_orders.approve')}</button>
                  <button onClick={() => setConfirmDelete({id: selectedOrder.id, type: 'cancel'})} className="btn-secondary flex items-center gap-1 text-sm text-red-600"><XCircle className="w-4 h-4" /> {t('purchase_orders.cancel')}</button>
                  <button onClick={() => setConfirmDelete({id: selectedOrder.id, type: 'delete'})} className="btn-secondary flex items-center gap-1 text-sm text-red-600"><Trash2 className="w-4 h-4" /> {t('purchase_orders.delete')}</button>
                </>
              )}
              {selectedOrder.status === 'approved' && (
                <button onClick={handleReceive} className="btn-primary flex items-center gap-1 text-sm"><RefreshCw className="w-4 h-4" /> {t('purchase_orders.receive')}</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'cancel') handleCancel();
          else if (confirmDelete?.type === 'delete') handleDelete();
          setConfirmDelete(null);
        }}
        title={t('common.confirm')}
        message={confirmDelete?.type === 'cancel' ? t('purchase_orders.confirm_cancel') : t('purchase_orders.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
