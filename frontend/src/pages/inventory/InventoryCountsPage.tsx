import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Play, CheckCircle, CheckSquare, ClipboardList } from 'lucide-react';
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

const statusStyles: Record<string, string> = {
  draft: 'badge-info',
  in_progress: 'badge-warning',
  completed: 'badge-info',
  approved: 'badge-success',
};

export default function InventoryCountsPage() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ warehouse_id: '', count_date: new Date().toISOString().split('T')[0], notes: '' });

  const [selectedCount, setSelectedCount] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [countItems, setCountItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: t('inventory_counts.status_draft'),
      in_progress: t('inventory_counts.status_in_progress'),
      completed: t('inventory_counts.status_completed'),
      approved: t('inventory_counts.status_approved'),
    };
    return labels[status] || status;
  };

  useEffect(() => { fetchCounts(); api.get('/warehouses').then(r => setWarehouses(r.data || [])).catch(() => {}); }, [page, statusFilter]);

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.append('status', statusFilter);
      const res = await api.get(`/inventory-counts?${params}`);
      setCounts(res.data.counts || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/inventory-counts', {
        warehouse_id: parseInt(form.warehouse_id),
        count_date: form.count_date,
        notes: form.notes,
      });
      toast.success(t('common.save'));
      setShowAddModal(false);
      setForm({ warehouse_id: '', count_date: new Date().toISOString().split('T')[0], notes: '' });
      fetchCounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const openDetail = async (count: any) => {
    try {
      const res = await api.get(`/inventory-counts/${count.id}`);
      setSelectedCount(res.data);
      setCountItems(res.data.items || []);
    } catch {
      setSelectedCount(count);
      setCountItems(count.items || []);
    }
    setShowDetailModal(true);
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selectedCount) return;
    try {
      await api.put(`/inventory-counts/${selectedCount.id}`, { status });
      toast.success(t('common.save'));
      openDetail(selectedCount);
      fetchCounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleApprove = async () => {
    if (!selectedCount) return;
    try {
      await api.post(`/inventory-counts/${selectedCount.id}/approve`);
      toast.success(t('common.save'));
      openDetail(selectedCount);
      fetchCounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleUpdateItem = async (itemId: number, actualQuantity: number) => {
    try {
      await api.put(`/inventory-counts/${selectedCount.id}/items/${itemId}`, { actual_quantity: actualQuantity });
      fetchCounts();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/inventory-counts/${id}`);
      toast.success(t('common.save'));
      if (selectedCount?.id === id) { setShowDetailModal(false); setSelectedCount(null); }
      fetchCounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const columns = [
    { key: 'warehouse_name', label: t('inventory_counts.warehouse'), render: (v: string) => <Link to={'/inventory/warehouses'} className="hover:text-primary-600 transition-colors font-medium">{v || '-'}</Link> },
    { key: 'count_date', label: t('inventory_counts.date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'status', label: t('inventory_counts.status'), render: (v: string) => <span className={`badge ${statusStyles[v] || 'badge-info'}`}>{getStatusLabel(v)}</span> },
    { key: 'created_by_name', label: t('inventory_counts.created_by'), render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('inventory.items'), path: '/inventory' }, { label: t('inventory_counts.breadcrumb') }]} />
      <PageHeader title={t('inventory_counts.title')} actions={
        <><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('inventory_counts.new')}</button><PrintButton /></>
      } />

      <div className="mb-4">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="select-field w-44">
          <option value="">{t('inventory_counts.all_statuses')}</option>
          <option value="draft">{t('inventory_counts.status_draft')}</option>
          <option value="in_progress">{t('inventory_counts.status_in_progress')}</option>
          <option value="completed">{t('inventory_counts.status_completed')}</option>
          <option value="approved">{t('inventory_counts.status_approved')}</option>
        </select>
      </div>

      <DataTable columns={columns} data={counts} loading={loading} page={page} total={total} limit={20} onPageChange={setPage} />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('inventory_counts.new_title')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('inventory_counts.warehouse')} *</label><select value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })} className="select-field" required><option value="">{t('inventory_counts.select_warehouse')}</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">{t('inventory_counts.date')}</label><input type="date" value={form.count_date} onChange={e => setForm({ ...form, count_date: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium mb-1">{t('inventory_counts.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          <button type="submit" className="btn-primary w-full">{t('inventory_counts.add')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedCount(null); setCountItems([]); }} title={`${t('inventory_counts.count_title')}: ${selectedCount?.warehouse_name || ''}`} size="xl">
        {selectedCount && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{t('inventory_counts.status')}:</span>
                <span className={`badge ${statusStyles[selectedCount.status] || 'badge-info'}`}>{getStatusLabel(selectedCount.status)}</span>
              </div>
              <div className="text-sm text-gray-500">{selectedCount.count_date ? formatDate(selectedCount.count_date) : ''}</div>
            </div>

            {selectedCount.notes && <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedCount.notes}</p>}

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full">
                <thead><tr className="bg-gray-50"><th className="table-header">{t('inventory_counts.item')}</th><th className="table-header text-left">{t('inventory_counts.system_qty')}</th><th className="table-header text-left">{t('inventory_counts.actual_qty')}</th><th className="table-header text-left">{t('inventory_counts.difference')}</th><th className="table-header">{t('inventory_counts.notes_col')}</th></tr></thead>
                <tbody>
                  {countItems.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-gray-400">{t('inventory_counts.no_items')}</td></tr>
                  ) : countItems.map((it: any, i: number) => {
                    const diff = (it.actual_quantity || 0) - (it.system_quantity || 0);
                    return (
                      <tr key={it.id || i} className="hover:bg-gray-50">
                        <td className="table-cell font-medium"><Link to={'/inventory/items'} className="hover:text-primary-600 transition-colors">{it.item_name || '-'}</Link></td>
                        <td className="table-cell text-left font-mono">{it.system_quantity || 0}</td>
                        <td className="table-cell text-left">
                          {selectedCount.status === 'draft' || selectedCount.status === 'in_progress' ? (
                            <input type="number" min={0} value={it.actual_quantity ?? it.system_quantity ?? 0} onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setCountItems(prev => prev.map((p: any) => p.id === it.id ? { ...p, actual_quantity: val } : p));
                              handleUpdateItem(it.id, val);
                            }} className="input-field text-xs w-24 font-mono" />
                          ) : (
                            <span className="font-mono">{it.actual_quantity || 0}</span>
                          )}
                        </td>
                        <td className={`table-cell text-left font-mono ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </td>
                        <td className="table-cell text-sm text-gray-500">{it.notes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              {selectedCount.status === 'draft' && (
                <button onClick={() => handleStatusUpdate('in_progress')} className="btn-primary flex items-center gap-2"><Play className="w-4 h-4" /> {t('inventory_counts.start')}</button>
              )}
              {selectedCount.status === 'in_progress' && (
                <button onClick={() => handleStatusUpdate('completed')} className="btn-primary flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {t('inventory_counts.complete')}</button>
              )}
              {selectedCount.status === 'completed' && (
                <button onClick={handleApprove} className="btn-success flex items-center gap-2"><CheckSquare className="w-4 h-4" /> {t('inventory_counts.approve')}</button>
              )}
              {(selectedCount.status === 'draft' || selectedCount.status === 'in_progress') && (
                <button onClick={() => setConfirmDelete(selectedCount.id)} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t('inventory_counts.delete')}</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('inventory_counts.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
