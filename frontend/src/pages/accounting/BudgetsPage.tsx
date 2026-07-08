import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Copy, BarChart3, ListChecks } from 'lucide-react';
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

export default function BudgetsPage() {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [accounts, setAccounts] = useState<any[]>([]);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', fiscal_year: String(new Date().getFullYear()), period_type: 'monthly' });

  const [selectedBudget, setSelectedBudget] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'items' | 'report'>('items');
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState({ account_id: '', period: '1', amount: '' });
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'budget' | 'item'} | null>(null);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ new_fiscal_year: String(new Date().getFullYear() + 1), new_name: '' });

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { fetchBudgets(); }, [yearFilter]);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      setAccounts(res.data.accounts || []);
    } catch { /* ignore */ }
  };

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter) params.append('fiscal_year', yearFilter);
      const res = await api.get(`/budgets?${params}`);
      setBudgets(res.data.budgets || res.data.data || res.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const fetchBudgetItems = async (id: number) => {
    setLoadingItems(true);
    try {
      const res = await api.get(`/budgets/${id}`);
      setBudgetItems(res.data.items || res.data.budget_items || []);
    } catch { setBudgetItems([]); }
    finally { setLoadingItems(false); }
  };

  const fetchBudgetReport = async (id: number) => {
    setLoadingReport(true);
    try {
      const res = await api.get(`/budgets/${id}/report`);
      setReportData(res.data.report || res.data || []);
    } catch { setReportData([]); }
    finally { setLoadingReport(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/budgets/${editing.id}`, form);
        toast.success(t('common.success'));
      } else {
        await api.post('/budgets', form);
        toast.success(t('common.success'));
      }
      setShowFormModal(false);
      setEditing(null);
      setForm({ name: '', fiscal_year: String(new Date().getFullYear()), period_type: 'monthly' });
      fetchBudgets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/budgets/${id}`);
      toast.success(t('common.success'));
      if (selectedBudget?.id === id) { setSelectedBudget(null); setShowDetail(false); }
      fetchBudgets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { account_id: parseInt(itemForm.account_id), period: parseInt(itemForm.period), amount: parseFloat(itemForm.amount) };
      await api.post(`/budgets/${selectedBudget!.id}/items`, payload);
      toast.success(t('common.success'));
      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({ account_id: '', period: '1', amount: '' });
      fetchBudgetItems(selectedBudget!.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await api.delete(`/budgets/items/${itemId}`);
      toast.success(t('common.success'));
      fetchBudgetItems(selectedBudget!.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/budgets/${selectedBudget!.id}/duplicate`, duplicateForm);
      toast.success(t('common.success'));
      setShowDuplicateModal(false);
      setDuplicateForm({ new_fiscal_year: String(new Date().getFullYear() + 1), new_name: '' });
      fetchBudgets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const openDetail = async (budget: any) => {
    try {
      const res = await api.get(`/budgets/${budget.id}`);
      setSelectedBudget(res.data);
    } catch {
      setSelectedBudget(budget);
    }
    setShowDetail(true);
    setDetailTab('items');
    fetchBudgetItems(budget.id);
  };

  useEffect(() => {
    if (detailTab === 'report' && selectedBudget) {
      fetchBudgetReport(selectedBudget.id);
    }
  }, [detailTab, selectedBudget?.id]);

  const columns = [
    { key: 'name', label: t('budget.name'), render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'fiscal_year', label: t('budget.fiscal_year'), render: (v: string) => <span className="badge badge-info">{v}</span> },
    { key: 'period_type', label: t('budget.period_type'), render: (v: string) => {
      const periodMap: Record<string, string> = { monthly: t('budget.monthly'), quarterly: t('budget.quarterly'), yearly: t('budget.yearly') };
      return <span className="badge badge-info">{periodMap[v] || v}</span>;
    }},
    { key: 'created_at', label: t('budget.created_at'), render: (v: string) => v ? formatDate(v) : '-' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => String(currentYear - 5 + i));

  return (
    <div>
      <Breadcrumbs items={[{ label: t('common.accounting'), path: '/accounting' }, { label: t('budget.title') }]} />
      <PageHeader title={t('budget.title')} actions={
        <><button onClick={() => { setEditing(null); setForm({ name: '', fiscal_year: String(new Date().getFullYear()), period_type: 'monthly' }); setShowFormModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('budget.new')}</button><PrintButton /></>
      } />

      <div className="mb-4">
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="select-field w-44">
          <option value="">{t('budget.all_years')}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={budgets} loading={loading} searchable={false} />

      <Modal isOpen={showFormModal} onClose={() => setShowFormModal(false)} title={editing ? t('budget.edit_title') : t('budget.add_title')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('budget.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('budget.fiscal_year')}</label><select value={form.fiscal_year} onChange={e => setForm({ ...form, fiscal_year: e.target.value })} className="select-field">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('budget.period_type')}</label><select value={form.period_type} onChange={e => setForm({ ...form, period_type: e.target.value })} className="select-field"><option value="monthly">{t('budget.monthly')}</option><option value="quarterly">{t('budget.quarterly')}</option><option value="yearly">{t('budget.yearly')}</option></select></div>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? t('budget.update_btn') : t('budget.add_btn')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedBudget(null); setBudgetItems([]); setReportData([]); }} title={selectedBudget?.name || t('budget.detail_title')} size="xl">
        {selectedBudget && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <button onClick={() => setDetailTab('items')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${detailTab === 'items' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}><ListChecks className="w-4 h-4 inline ml-1" /> {t('budget.items_tab')}</button>
              <button onClick={() => setDetailTab('report')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${detailTab === 'report' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}><BarChart3 className="w-4 h-4 inline ml-1" /> {t('budget.report_tab')}</button>
            </div>

            {detailTab === 'items' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold">{t('budget.items_title')}</h4>
                  <button onClick={() => { setEditingItem(null); setItemForm({ account_id: '', period: '1', amount: '' }); setShowItemModal(true); }} className="btn-primary text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> {t('budget.add_item')}</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><th className="table-header">{t('budget.account_code')}</th><th className="table-header">{t('budget.account_name')}</th><th className="table-header">{t('budget.period')}</th><th className="table-header text-left">{t('budget.amount')}</th><th className="table-header"></th></tr></thead>
                    <tbody>
                      {loadingItems ? <tr><td colSpan={5} className="text-center py-4 text-gray-500">{t('common.loading')}</td></tr> :
                        budgetItems.length === 0 ? <tr><td colSpan={5} className="text-center py-4 text-gray-500">{t('budget.no_items')}</td></tr> :
                        budgetItems.map((item: any, i: number) => (
                          <tr key={item.id || i} className="hover:bg-gray-50">
                            <td className="table-cell text-gray-500">{item.account_code || (item.account?.code) || '-'}</td>
                            <td className="table-cell">{item.account_name || (item.account?.name) || '-'}</td>
                            <td className="table-cell">{item.period || '-'}</td>
                            <td className="table-cell text-left font-mono">{formatCurrency(item.amount || 0)}</td>
                            <td className="table-cell">
                              <div className="flex gap-1">
                                <button onClick={() => setConfirmDelete({id: item.id, type: 'item'})} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailTab === 'report' && (
              <div>
                <h4 className="font-semibold mb-3">{t('budget.report_subtitle')}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><th className="table-header">{t('budget.account_code')}</th><th className="table-header">{t('budget.account_name')}</th><th className="table-header text-left">{t('budget.budget_amount')}</th><th className="table-header text-left">{t('budget.actual_amount')}</th><th className="table-header text-left">{t('budget.variance')}</th><th className="table-header text-left">{t('budget.variance_percent')}</th></tr></thead>
                    <tbody>
                      {loadingReport ? <tr><td colSpan={6} className="text-center py-4 text-gray-500">{t('common.loading')}</td></tr> :
                        reportData.length === 0 ? <tr><td colSpan={6} className="text-center py-4 text-gray-500">{t('budget.no_report_data')}</td></tr> :
                        reportData.map((r: any, i: number) => {
                          const variance = (r.actual_amount || 0) - (r.budget_amount || 0);
                          const variancePercent = r.budget_amount ? (variance / r.budget_amount) * 100 : 0;
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="table-cell text-gray-500">{r.account_code || '-'}</td>
                              <td className="table-cell">{r.account_name || '-'}</td>
                              <td className="table-cell text-left font-mono">{formatCurrency(r.budget_amount || 0)}</td>
                              <td className="table-cell text-left font-mono">{formatCurrency(r.actual_amount || 0)}</td>
                              <td className={`table-cell text-left font-mono ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(variance)}</td>
                              <td className={`table-cell text-left font-mono ${variancePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{variancePercent.toFixed(2)}%</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    {reportData.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 font-bold">
                          <td colSpan={2} className="table-cell text-gray-700">{t('budget.total')}</td>
                          <td className="table-cell text-left font-mono">{formatCurrency(reportData.reduce((s, r) => s + (r.budget_amount || 0), 0))}</td>
                          <td className="table-cell text-left font-mono">{formatCurrency(reportData.reduce((s, r) => s + (r.actual_amount || 0), 0))}</td>
                          <td className="table-cell text-left font-mono">{formatCurrency(reportData.reduce((s, r) => s + ((r.actual_amount || 0) - (r.budget_amount || 0)), 0))}</td>
                          <td className="table-cell text-left"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => setShowDuplicateModal(true)} className="btn-secondary flex items-center gap-2"><Copy className="w-4 h-4" /> {t('budget.duplicate')}</button>
              <button onClick={() => setConfirmDelete({id: selectedBudget.id, type: 'budget'})} className="btn-danger flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t('budget.delete_btn')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showItemModal} onClose={() => { setShowItemModal(false); setEditingItem(null); setItemForm({ account_id: '', period: '1', amount: '' }); }} title={t('budget.item_modal_title')}>
        <form onSubmit={handleItemSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('budget.account_select')}</label><select value={itemForm.account_id} onChange={e => setItemForm({ ...itemForm, account_id: e.target.value })} className="select-field" required><option value="">{t('budget.select_account')}</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('budget.period_number')}</label><input type="number" min="1" value={itemForm.period} onChange={e => setItemForm({ ...itemForm, period: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('budget.amount')}</label><input type="number" step="0.01" value={itemForm.amount} onChange={e => setItemForm({ ...itemForm, amount: e.target.value })} className="input-field" required /></div>
          </div>
          <button type="submit" className="btn-primary w-full">{t('budget.add_item_btn')}</button>
        </form>
      </Modal>

      <Modal isOpen={showDuplicateModal} onClose={() => setShowDuplicateModal(false)} title={t('budget.duplicate_title')}>
        <form onSubmit={handleDuplicate} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('budget.new_fiscal_year')}</label><select value={duplicateForm.new_fiscal_year} onChange={e => setDuplicateForm({ ...duplicateForm, new_fiscal_year: e.target.value })} className="select-field">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">{t('budget.new_name')}</label><input type="text" value={duplicateForm.new_name} onChange={e => setDuplicateForm({ ...duplicateForm, new_name: e.target.value })} className="input-field" required placeholder={t('budget.new_name_placeholder')} /></div>
          <button type="submit" className="btn-primary w-full">{t('budget.copy_btn')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'budget') handleDelete(confirmDelete.id);
          else if (confirmDelete?.type === 'item') handleDeleteItem(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('budget.delete_title')}
        message={confirmDelete?.type === 'budget' ? t('budget.delete_message_budget') : t('budget.delete_message_item')}
        variant="danger"
      />
    </div>
  );
}
