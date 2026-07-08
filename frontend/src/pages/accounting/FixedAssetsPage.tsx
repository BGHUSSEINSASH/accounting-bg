import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, TrendingDown, Ban, PackageOpen, DollarSign, Building2, Hash, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { useTranslation } from '../../i18n/context';
import PrintButton from '../../components/ui/PrintButton';

export default function FixedAssetsPage() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', category: 'furniture', purchase_date: new Date().toISOString().split('T')[0], purchase_cost: '', residual_value: '0', useful_life_years: '5', depreciation_method: 'straight_line', location: '', notes: '', account_id: '' });

  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [depreciationHistory, setDepreciationHistory] = useState<any[]>([]);
  const [loadingDepreciation, setLoadingDepreciation] = useState(false);

  const [showDepreciateModal, setShowDepreciateModal] = useState(false);
  const [depreciateForm, setDepreciateForm] = useState({ month: String(new Date().getMonth() + 1).padStart(2, '0'), year: String(new Date().getFullYear()) });

  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [disposeForm, setDisposeForm] = useState({ disposal_date: new Date().toISOString().split('T')[0], disposal_amount: '0', status: 'disposed' });

  const [stats, setStats] = useState({ total_count: 0, total_cost: 0, total_depreciation: 0, net_book_value: 0 });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { fetchAssets(); }, [page, statusFilter, categoryFilter]);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      setAccounts(res.data.accounts || []);
    } catch { /* ignore */ }
  };

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      const res = await api.get(`/fixed-assets?${params}`);
      setAssets(res.data.assets || res.data.data || []);
      setTotal(res.data.total || 0);
      if (res.data.stats) setStats(res.data.stats);
      else computeStats(res.data.assets || res.data.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const computeStats = (data: any[]) => {
    const total_count = data.length;
    const total_cost = data.reduce((s, a) => s + Number(a.purchase_cost || 0), 0);
    const total_depreciation = data.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0);
    setStats({ total_count, total_cost, total_depreciation, net_book_value: total_cost - total_depreciation });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        purchase_cost: parseFloat(form.purchase_cost) || 0,
        residual_value: parseFloat(form.residual_value) || 0,
        useful_life_years: parseInt(form.useful_life_years) || 5,
        account_id: form.account_id ? parseInt(form.account_id) : null,
      };
      if (editing) {
        await api.put(`/fixed-assets/${editing.id}`, payload);
        toast.success(t('common.success'));
      } else {
        await api.post('/fixed-assets', payload);
        toast.success(t('common.success'));
      }
      setShowFormModal(false);
      setEditing(null);
      setForm({ name: '', category: 'furniture', purchase_date: new Date().toISOString().split('T')[0], purchase_cost: '', residual_value: '0', useful_life_years: '5', depreciation_method: 'straight_line', location: '', notes: '', account_id: '' });
      fetchAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/fixed-assets/${id}`);
      toast.success(t('common.success'));
      if (selectedAsset?.id === id) { setSelectedAsset(null); setShowDetailModal(false); }
      fetchAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const openDetail = async (asset: any) => {
    try {
      const res = await api.get(`/fixed-assets/${asset.id}`);
      setSelectedAsset(res.data);
    } catch {
      setSelectedAsset(asset);
    }
    setShowDetailModal(true);
    fetchDepreciationHistory(asset.id);
  };

  const fetchDepreciationHistory = async (id: number) => {
    setLoadingDepreciation(true);
    try {
      const res = await api.get(`/fixed-assets/${id}/depreciation`);
      setDepreciationHistory(res.data || []);
    } catch { setDepreciationHistory([]); }
    finally { setLoadingDepreciation(false); }
  };

  const handleDepreciate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/fixed-assets/${selectedAsset!.id}/depreciate`, depreciateForm);
      toast.success(t('common.success'));
      setShowDepreciateModal(false);
      setDepreciateForm({ month: String(new Date().getMonth() + 1).padStart(2, '0'), year: String(new Date().getFullYear()) });
      openDetail(selectedAsset!);
      fetchAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/fixed-assets/${selectedAsset!.id}/dispose`, { ...disposeForm, disposal_amount: parseFloat(disposeForm.disposal_amount) || 0 });
      toast.success(t('common.success'));
      setShowDisposeModal(false);
      setDisposeForm({ disposal_date: new Date().toISOString().split('T')[0], disposal_amount: '0', status: 'disposed' });
      openDetail(selectedAsset!);
      fetchAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const openEditModal = (asset: any) => {
    setEditing(asset);
    setForm({
      name: asset.name,
      category: asset.category || 'furniture',
      purchase_date: asset.purchase_date ? asset.purchase_date.split('T')[0] : '',
      purchase_cost: asset.purchase_cost?.toString() || '',
      residual_value: asset.residual_value?.toString() || '0',
      useful_life_years: asset.useful_life_years?.toString() || '5',
      depreciation_method: asset.depreciation_method || 'straight_line',
      location: asset.location || '',
      notes: asset.notes || '',
      account_id: asset.account_id?.toString() || '',
    });
    setShowFormModal(true);
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { active: 'badge-success', disposed: 'badge-danger', sold: 'badge-info' };
    const labels: Record<string, string> = { active: t('asset.active'), disposed: t('asset.disposed'), sold: t('asset.sold') };
    return <span className={colors[status] || 'badge-info'}>{labels[status] || status}</span>;
  };

  const columns = [
    { key: 'code', label: t('asset.code'), render: (_: any, row: any) => <span className="text-gray-500">{row.code || '-'}</span> },
    { key: 'name', label: t('asset.name'), render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'category', label: t('asset.category'), render: (v: string) => <span className="badge badge-info">{v || '-'}</span> },
    { key: 'purchase_date', label: t('asset.purchase_date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'purchase_cost', label: t('asset.purchase_cost'), render: (v: number) => <span className="font-mono">{formatCurrency(v || 0)}</span> },
    { key: 'current_book_value', label: t('asset.book_value'), render: (_: any, row: any) => <span className="font-mono">{formatCurrency((row.purchase_cost || 0) - (row.accumulated_depreciation || 0))}</span> },
    { key: 'status', label: t('asset.status'), render: (v: string) => statusBadge(v || 'active') },
  ];

  const categories = ['furniture', 'equipment', 'vehicles', 'real_estate', 'machinery', 'other'];
  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      furniture: t('asset.cat_furniture'),
      equipment: t('asset.cat_equipment'),
      vehicles: t('asset.cat_vehicles'),
      real_estate: t('asset.cat_real_estate'),
      machinery: t('asset.cat_machinery'),
      other: t('asset.cat_other'),
    };
    return labels[cat] || cat;
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('common.accounting'), path: '/accounting' }, { label: t('asset.title') }]} />
      <PageHeader title={t('asset.title')} actions={
        <><button onClick={() => { setEditing(null); setForm({ name: '', category: 'furniture', purchase_date: new Date().toISOString().split('T')[0], purchase_cost: '', residual_value: '0', useful_life_years: '5', depreciation_method: 'straight_line', location: '', notes: '', account_id: '' }); setShowFormModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('asset.new')}</button><PrintButton /></>
      } />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('asset.total_count')} value={formatNumber(stats.total_count)} icon={<PackageOpen className="w-6 h-6" />} color="primary" />
        <StatCard title={t('asset.total_cost')} value={formatCurrency(stats.total_cost)} icon={<DollarSign className="w-6 h-6" />} color="purple" />
        <StatCard title={t('asset.total_depreciation')} value={formatCurrency(stats.total_depreciation)} icon={<TrendingDown className="w-6 h-6" />} color="yellow" />
        <StatCard title={t('asset.net_book_value')} value={formatCurrency(stats.net_book_value)} icon={<Building2 className="w-6 h-6" />} color="green" />
      </div>

      <div className="flex gap-4 mb-4">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="select-field w-44">
          <option value="">{t('asset.all_statuses')}</option>
          <option value="active">{t('asset.active')}</option>
          <option value="disposed">{t('asset.disposed')}</option>
          <option value="sold">{t('asset.sold')}</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} className="select-field w-44">
          <option value="">{t('asset.all_categories')}</option>
          {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={assets} loading={loading} page={page} total={total} onPageChange={setPage} />

      <Modal isOpen={showFormModal} onClose={() => setShowFormModal(false)} title={editing ? t('asset.edit') : t('asset.add')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('asset.name_label')}</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.category')}</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="select-field">{categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.purchase_date_label')}</label><input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.purchase_cost_label')}</label><input type="number" step="0.01" value={form.purchase_cost} onChange={e => setForm({ ...form, purchase_cost: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.residual_value')}</label><input type="number" step="0.01" value={form.residual_value} onChange={e => setForm({ ...form, residual_value: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.useful_life')}</label><input type="number" value={form.useful_life_years} onChange={e => setForm({ ...form, useful_life_years: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.depreciation_method')}</label><select value={form.depreciation_method} onChange={e => setForm({ ...form, depreciation_method: e.target.value })} className="select-field"><option value="straight_line">{t('asset.straight_line')}</option><option value="declining">{t('asset.declining')}</option></select></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.account')}</label><select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className="select-field"><option value="">{t('asset.select_account')}</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.location')}</label><input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input-field" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium mb-1">{t('asset.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? t('asset.update_btn') : t('asset.add_btn')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedAsset(null); setDepreciationHistory([]); }} title={t('asset.detail_title')} size="xl">
        {selectedAsset && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs text-gray-500">{t('asset.code')}</p><p className="font-medium">{selectedAsset.code || '-'}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.name')}</p><p className="font-medium">{selectedAsset.name}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.category')}</p><p className="font-medium">{selectedAsset.category || '-'}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.purchase_date')}</p><p className="font-medium">{selectedAsset.purchase_date ? formatDate(selectedAsset.purchase_date) : '-'}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.purchase_cost')}</p><p className="font-medium">{formatCurrency(selectedAsset.purchase_cost || 0)}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.residual_value')}</p><p className="font-medium">{formatCurrency(selectedAsset.residual_value || 0)}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.useful_life')}</p><p className="font-medium">{selectedAsset.useful_life_years || '-'} {t('asset.years')}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.accumulated_depreciation')}</p><p className="font-medium">{formatCurrency(selectedAsset.accumulated_depreciation || 0)}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.book_value')}</p><p className="font-medium">{formatCurrency((selectedAsset.purchase_cost || 0) - (selectedAsset.accumulated_depreciation || 0))}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.depreciation_method')}</p><p className="font-medium">{selectedAsset.depreciation_method === 'straight_line' ? t('asset.straight_line') : t('asset.declining')}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.location')}</p><p className="font-medium">{selectedAsset.location || '-'}</p></div>
              <div><p className="text-xs text-gray-500">{t('asset.status')}</p><p className="font-medium">{statusBadge(selectedAsset.status || 'active')}</p></div>
              {selectedAsset.notes && <div className="col-span-3"><p className="text-xs text-gray-500">{t('asset.notes')}</p><p className="font-medium">{selectedAsset.notes}</p></div>}
            </div>

            <div>
              <h4 className="font-semibold mb-3">{t('asset.depreciation_history')}</h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className="table-header">{t('asset.month')}</th><th className="table-header">{t('asset.year')}</th><th className="table-header text-left">{t('asset.depreciation_amount')}</th><th className="table-header text-left">{t('asset.book_value_after')}</th><th className="table-header">{t('asset.date')}</th></tr></thead>
                  <tbody>
                    {loadingDepreciation ? <tr><td colSpan={5} className="text-center py-4 text-gray-500">{t('common.loading')}</td></tr> :
                      depreciationHistory.length === 0 ? <tr><td colSpan={5} className="text-center py-4 text-gray-500">{t('asset.no_history')}</td></tr> :
                      depreciationHistory.map((d: any, i: number) => (
                        <tr key={d.id || i} className="hover:bg-gray-50">
                          <td className="table-cell">{d.month || '-'}</td>
                          <td className="table-cell">{d.year || '-'}</td>
                          <td className="table-cell text-left font-mono">{formatCurrency(d.amount || d.depreciation_amount || 0)}</td>
                          <td className="table-cell text-left font-mono">{formatCurrency(d.book_value_after || 0)}</td>
                          <td className="table-cell">{d.created_at ? formatDate(d.created_at) : '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              {selectedAsset.status === 'active' && (
                <>
                  <button onClick={() => setShowDepreciateModal(true)} className="btn-primary flex items-center gap-2"><TrendingDown className="w-4 h-4" /> {t('asset.depreciate')}</button>
                  <button onClick={() => setShowDisposeModal(true)} className="btn-secondary flex items-center gap-2"><Ban className="w-4 h-4" /> {t('asset.dispose')}</button>
                </>
              )}
              <button onClick={() => { setShowDetailModal(false); openEditModal(selectedAsset); }} className="btn-secondary flex items-center gap-2"><Edit2 className="w-4 h-4" /> {t('asset.edit_btn')}</button>
              <button onClick={() => setConfirmDelete(selectedAsset.id)} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t('asset.delete_btn')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showDepreciateModal} onClose={() => setShowDepreciateModal(false)} title={t('asset.depreciate_title')}>
        <form onSubmit={handleDepreciate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('asset.month')}</label><select value={depreciateForm.month} onChange={e => setDepreciateForm({ ...depreciateForm, month: e.target.value })} className="select-field">
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => <option key={m} value={m}>{m}</option>)}
            </select></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.year')}</label><input type="number" value={depreciateForm.year} onChange={e => setDepreciateForm({ ...depreciateForm, year: e.target.value })} className="input-field" /></div>
          </div>
          <button type="submit" className="btn-primary w-full">{t('asset.depreciate_submit')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDisposeModal} onClose={() => setShowDisposeModal(false)} title={t('asset.dispose_title')}>
        <form onSubmit={handleDispose} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('asset.dispose_date')}</label><input type="date" value={disposeForm.disposal_date} onChange={e => setDisposeForm({ ...disposeForm, disposal_date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.dispose_amount')}</label><input type="number" step="0.01" value={disposeForm.disposal_amount} onChange={e => setDisposeForm({ ...disposeForm, disposal_amount: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('asset.dispose_status')}</label><select value={disposeForm.status} onChange={e => setDisposeForm({ ...disposeForm, status: e.target.value })} className="select-field"><option value="disposed">{t('asset.disposed')}</option><option value="sold">{t('asset.sold')}</option></select></div>
          </div>
          <button type="submit" className="btn-primary w-full">{t('asset.confirm')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('asset.delete_title')}
        message={t('asset.delete_message')}
        variant="danger"
      />
    </div>
  );
}
