import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

export default function JournalEntriesPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], description: '', items: [{ account_id: '', description: '', debit: '', credit: '' }] });

  useEffect(() => { fetchEntries(); }, [page, search, dateFrom, dateTo]);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchEntries = async () => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.append('search', search);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const res = await api.get(`/accounts/journal/entries?${params}`);
    setEntries(res.data.entries);
    setTotal(res.data.total);
    setLoading(false);
  };

  const fetchAccounts = async () => {
    const res = await api.get('/accounts');
      setAccounts((res.data.accounts || []).filter((a: any) => a.level >= 2));
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { account_id: '', description: '', debit: '', credit: '' }] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...form.items];
    (items[idx] as any)[field] = value;
    setForm({ ...form, items });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.items.map(i => ({
      account_id: parseInt(i.account_id),
      description: i.description || null,
      debit: parseFloat(i.debit) || 0,
      credit: parseFloat(i.credit) || 0
    }));
    await api.post('/accounts/journal/entries', { entry_date: form.entry_date, description: form.description, items });
    setShowModal(false);
    setForm({ entry_date: new Date().toISOString().split('T')[0], description: '', items: [{ account_id: '', description: '', debit: '', credit: '' }] });
    fetchEntries();
  };

  const postEntry = async (id: number) => {
    await api.post(`/accounts/journal/entries/${id}/post`);
    fetchEntries();
  };

  return (
    <div>
      <PageHeader title={t('journal.title')} actions={<><button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('journal.new')}</button><PrintButton /></>} />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('journal.search_placeholder')} className="input-field pr-9 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field text-sm" />
            <span className="text-gray-400 text-sm">{t('common.to')}</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">{t('journal.number')}</th>
                <th className="table-header">{t('journal.date')}</th>
                <th className="table-header">{t('journal.description')}</th>
                <th className="table-header">{t('journal.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="text-center py-8">{t('common.loading')}</td></tr> : entries.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-gray-500">{t('journal.empty')}</td></tr> : entries.map((e: any) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{e.entry_number}</td>
                  <td className="table-cell">{formatDate(e.entry_date)}</td>
                  <td className="table-cell">{e.description || '-'}</td>
                  <td className="table-cell"><span className={`badge ${e.is_posted ? 'badge-success' : 'badge-warning'}`}>{e.is_posted ? t('journal.posted') : t('journal.not_posted')}</span></td>
                  <td className="table-cell">
                    {!e.is_posted && <button onClick={() => postEntry(e.id)} className="btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t('journal.post')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('journal.new_title')} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('journal.entry_date')}</label>
              <input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('journal.description')}</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" />
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">{t('journal.account')}</th>
                  <th className="table-header">{t('journal.description')}</th>
                  <th className="table-header">{t('journal.debit')}</th>
                  <th className="table-header">{t('journal.credit')}</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="table-cell">
                      <select value={item.account_id} onChange={e => updateItem(idx, 'account_id', e.target.value)} className="select-field text-xs" required>
                        <option value="">{t('common.select')}</option>
                        {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                    </td>
                    <td className="table-cell"><input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-xs" /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={item.debit} onChange={e => updateItem(idx, 'debit', e.target.value)} className="input-field text-xs" /></td>
                    <td className="table-cell"><input type="number" step="0.01" value={item.credit} onChange={e => updateItem(idx, 'credit', e.target.value)} className="input-field text-xs" /></td>
                    <td className="table-cell">{form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 text-xs">X</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addItem} className="btn-secondary text-sm">{t('journal.add_line')}</button>

          <button type="submit" className="btn-primary w-full">{t('journal.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
