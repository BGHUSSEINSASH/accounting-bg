import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InvoicePrintModal from '../../components/printing/InvoicePrintModal';
import { formatDate, formatCurrency, getStatusBadgeClass, getStatusText } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function ExpensesPage() {
  const { t } = useTranslation();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [printExpense, setPrintExpense] = useState<any>(null);
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'general', description: '', amount: '', account_id: '' });

  useEffect(() => { fetchExpenses(); }, [page]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/expenses?page=${page}&limit=20`);
      setExpenses(res.data.expenses || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (expense: any) => {
    setEditingId(expense.id);
    setForm({
      expense_date: expense.expense_date?.split('T')[0] || '',
      category: expense.category || 'general',
      description: expense.description || '',
      amount: String(expense.amount || ''),
      account_id: expense.account_id ? String(expense.account_id) : '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/expenses/${editingId}`, form);
      } else {
        await api.post('/expenses', form);
      }
      setShowModal(false);
      setEditingId(null);
      setForm({ expense_date: new Date().toISOString().split('T')[0], category: 'general', description: '', amount: '', account_id: '' });
      fetchExpenses();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/expenses/${id}`);
      toast.success(t('common.deleted'));
      fetchExpenses();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const handlePrint = async (id: number) => {
    try {
      const res = await api.get(`/expenses/${id}/print`);
      setPrintExpense(res.data);
    } catch { }
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm({ expense_date: new Date().toISOString().split('T')[0], category: 'general', description: '', amount: '', account_id: '' });
    setShowModal(true);
  };

  return (
    <div>
      <PageHeader title={t('expenses.title')} actions={<button onClick={openAddModal} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('expenses.new')}</button>} />
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('expenses.date')}</th><th className="table-header">{t('expenses.category')}</th><th className="table-header">{t('expenses.description')}</th><th className="table-header text-left">{t('expenses.amount')}</th><th className="table-header">{t('common.status')}</th><th className="table-header">{t('expenses.registered_by')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8">{t('common.loading')}</td></tr> : expenses.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-500">{t('expenses.no_expenses')}</td></tr> : expenses.map((e: any) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="table-cell">{formatDate(e.expense_date)}</td>
                  <td className="table-cell"><span className="badge badge-info">{e.category}</span></td>
                  <td className="table-cell">{e.description}</td>
                  <td className="table-cell text-left font-mono text-red-600">{formatCurrency(e.amount)}</td>
                  <td className="table-cell"><span className={`badge ${getStatusBadgeClass(e.status)}`}>{getStatusText(e.status)}</span></td>
                  <td className="table-cell">{e.paid_by_name || '-'}</td>
                  <td className="table-cell">
                    <div className="flex gap-1 items-center justify-end">
                      <button onClick={() => handlePrint(e.id)} className="p-1 hover:bg-gray-100 rounded" title={t('common.print')}><Printer className="w-4 h-4 text-gray-500" /></button>
                      <button onClick={() => handleEdit(e)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button>
                      <button onClick={() => setConfirmDelete(e.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingId(null); }} title={editingId ? t('expenses.edit') : t('expenses.new')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('expenses.date')}</label><input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('expenses.category')}</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="select-field"><option value="general">{t('expenses.cat_general')}</option><option value="rent">{t('expenses.cat_rent')}</option><option value="electricity">{t('expenses.cat_electricity')}</option><option value="water">{t('expenses.cat_water')}</option><option value="telecom">{t('expenses.cat_telecom')}</option><option value="transport">{t('expenses.cat_transport')}</option><option value="maintenance">{t('expenses.cat_maintenance')}</option><option value="marketing">{t('expenses.cat_marketing')}</option><option value="salaries">{t('expenses.cat_salaries')}</option><option value="other">{t('expenses.cat_other')}</option></select></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">{t('expenses.description')}</label><input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium mb-1">{t('expenses.amount')}</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-field" required /></div>
          <button type="submit" className="btn-primary w-full">{editingId ? t('common.save') : t('expenses.save')}</button>
        </form>
      </Modal>

      <InvoicePrintModal
        isOpen={printExpense !== null}
        onClose={() => setPrintExpense(null)}
        data={printExpense}
        type="expense"
      />

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('expenses.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
