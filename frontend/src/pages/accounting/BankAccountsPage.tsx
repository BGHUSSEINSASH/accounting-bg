import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

const CURRENCIES = ['IQD', 'SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD'];

export default function BankAccountsPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ account_name: '', bank_name: '', account_number: '', iban: '', currency: 'IQD', opening_balance: '' });

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/bank-accounts');
      setAccounts(res.data.accounts || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, opening_balance: parseFloat(form.opening_balance) || 0 };
      if (editing) {
        await api.put(`/bank-accounts/${editing.id}`, payload);
        toast.success(t('common.update'));
      } else {
        await api.post('/bank-accounts', payload);
        toast.success(t('common.add'));
      }
      setShowModal(false);
      setEditing(null);
      setForm({ account_name: '', bank_name: '', account_number: '', iban: '', currency: 'IQD', opening_balance: '' });
      fetchAccounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/bank-accounts/${id}`);
      toast.success(t('common.delete'));
      fetchAccounts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const handleDeleteClick = (id: number) => setConfirmDelete(id);

  const openEdit = (account: any) => {
    setEditing(account);
    setForm({
      account_name: account.account_name,
      bank_name: account.bank_name || '',
      account_number: account.account_number || '',
      iban: account.iban || '',
      currency: account.currency || 'IQD',
      opening_balance: account.opening_balance?.toString() || '',
    });
    setShowModal(true);
  };

  const columns = [
    { key: 'account_name', label: t('accounting.bank_account_name'), render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'bank_name', label: t('accounting.bank_name') },
    { key: 'account_number', label: t('accounting.account_number') },
    { key: 'iban', label: t('accounting.iban') },
    { key: 'currency', label: t('accounting.currency'), render: (v: string) => <span className="badge badge-info">{v || 'IQD'}</span> },
    { key: 'opening_balance', label: t('accounting.opening_balance'), render: (v: number) => <span className="font-mono">{formatCurrency(v || 0)}</span> },
    { key: 'current_balance', label: t('accounting.current_balance'), render: (_: any, row: any) => <span className="font-mono font-bold">{formatCurrency(row.current_balance || 0)}</span> },
  ];

  const columnsWithActions = [...columns, { key: 'actions', label: '', render: (_: any, row: any) => <button onClick={() => handleDeleteClick(row.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button> }];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.accounting'), path: '/accounting' }, { label: t('accounting.bank_accounts') }]} />
      <PageHeader title={t('accounting.bank_accounts')} actions={
        <><button onClick={() => { setEditing(null); setForm({ account_name: '', bank_name: '', account_number: '', iban: '', currency: 'IQD', opening_balance: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('accounting.new_account')}</button><PrintButton /></>
      } />
      <DataTable columns={columnsWithActions} data={accounts} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('common.edit') : t('accounting.new_account')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">{t('accounting.bank_account_name')} *</label><input type="text" value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">{t('accounting.bank_name')}</label><input type="text" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('accounting.account_number')}</label><input type="text" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('accounting.iban')}</label><input type="text" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">{t('accounting.currency')}</label><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="select-field">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">{t('accounting.opening_balance')}</label><input type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} className="input-field" /></div>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? t('common.update') : t('common.add')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('common.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
