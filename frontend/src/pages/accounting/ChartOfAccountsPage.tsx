import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronLeft, GitBranch } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatCurrency } from '../../utils/format';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { useTranslation } from '../../i18n/context';

export default function ChartOfAccountsPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [form, setForm] = useState({ code: '', name: '', name_en: '', type: 'asset', parent_id: '' });

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      setAccounts(res.data.accounts || []);
    } finally { setLoading(false); }
  };

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) newExpanded.delete(id); else newExpanded.add(id);
    setExpanded(newExpanded);
  };

  const openAddSub = (parentAccount: any) => {
    setEditing(null);
    setForm({ code: '', name: '', name_en: '', type: parentAccount.type, parent_id: parentAccount.id.toString() });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, parent_id: form.parent_id ? parseInt(form.parent_id) : null };
    if (editing) {
      await api.put(`/accounts/${editing.id}`, data);
    } else {
      await api.post('/accounts', data);
    }
    setShowModal(false);
    setEditing(null);
    setForm({ code: '', name: '', name_en: '', type: 'asset', parent_id: '' });
    fetchAccounts();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/accounts/${id}`);
    fetchAccounts();
  };

  const renderAccounts = (parentId: number | null, level: number = 0): JSX.Element[] => {
    return accounts.filter(a => a.parent_id === parentId).flatMap(account => {
      const hasChildren = accounts.some(a => a.parent_id === account.id);
      const isExpanded = expanded.has(account.id);
      const rows: JSX.Element[] = [
        <tr key={account.id} className="hover:bg-gray-50">
          <td className="table-cell">
            <div className="flex items-center gap-1" style={{ marginRight: level * 20 }}>
              {hasChildren ? (
                <button onClick={() => toggleExpand(account.id)} className="p-0.5 text-gray-400 hover:text-gray-700">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-5 inline-block" />
              )}
              <span className={level === 0 ? 'font-bold' : level === 1 ? 'font-medium' : 'text-gray-600'}>
                {account.name}
              </span>
              {account.name_en && <span className="text-xs text-gray-400 mr-1">({account.name_en})</span>}
            </div>
          </td>
          <td className="table-cell text-gray-500">{account.code}</td>
          <td className="table-cell">
            <span className="badge badge-info">{ACCOUNT_TYPES.find(t => t.value === account.type)?.label}</span>
          </td>
          <td className="table-cell text-left font-mono text-sm">{formatCurrency(account.balance || 0)}</td>
          <td className="table-cell">
            <div className="flex gap-1">
              <button title="إضافة حساب فرعي" onClick={() => openAddSub(account)} className="p-1 hover:bg-green-50 rounded text-green-500"><GitBranch className="w-4 h-4" /></button>
              <button title="تعديل" onClick={() => { setEditing(account); setForm({ code: account.code, name: account.name, name_en: account.name_en || '', type: account.type, parent_id: account.parent_id?.toString() || '' }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button>
              <button title="حذف" onClick={() => setConfirmDelete(account.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          </td>
        </tr>
      ];
      if (isExpanded) {
        rows.push(...renderAccounts(account.id, level + 1));
      }
      return rows;
    });
  };

  return (
    <div>
      <PageHeader title={t('chart.title')} subtitle={t('chart.subtitle')} actions={<><button onClick={() => { setEditing(null); setForm({ code: '', name: '', name_en: '', type: 'asset', parent_id: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('chart.new_account')}</button><PrintButton /></>} />

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">{t('chart.account_name')}</th>
                <th className="table-header">{t('chart.code')}</th>
                <th className="table-header">{t('chart.type')}</th>
                <th className="table-header text-left">{t('chart.balance')}</th>
                <th className="table-header">{t('chart.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={5} className="text-center py-8 text-gray-500">{t('common.loading')}</td></tr>
                : accounts.filter(a => a.parent_id === null).length === 0
                  ? <tr><td colSpan={5} className="text-center py-8 text-gray-500">{t('chart.empty')}</td></tr>
                  : renderAccounts(null)
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('chart.edit_account') : t('chart.new_account')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('chart.code_label')}</label>
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('chart.type')}</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="select-field">
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('chart.account_name')}</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('chart.name_english')}</label>
            <input type="text" value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('chart.parent_account')}</label>
            <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} className="select-field">
              <option value="">{t('chart.no_parent')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? t('chart.edit_btn') : t('chart.add_btn')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('chart.delete_title')}
        message={t('chart.delete_message')}
        variant="danger"
      />
    </div>
  );
}
