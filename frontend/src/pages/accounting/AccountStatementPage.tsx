import { useState, useEffect } from 'react';
import { FileText, Building2, User } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function AccountStatementPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'client' | 'supplier'>('client');
  const [clients, setClients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data || []));
    api.get('/suppliers').then(res => setSuppliers(res.data || []));
  }, []);

  const loadStatement = () => {
    if (!selectedId) return;
    setLoading(true);
    const entity = mode === 'client' ? 'client' : 'supplier';
    api.get(`/account-statement/${entity}/${selectedId}`, { params: { from, to } })
      .then(res => setData(res.data))
      .catch(() => toast.error(t('error.load')))
      .finally(() => setLoading(false));
  };

  const columns = [
    { key: 'date', label: t('common.date'), render: (v: string) => formatDate(v) },
    { key: 'ref', label: t('common.reference') },
    { key: 'type', label: t('common.description'), render: (v: string) => v === 'invoice' ? t('sales.invoice') : t('common.pay') },
    { key: 'debit', label: t('common.debit'), render: (v: number) => v ? formatCurrency(v) : '-' },
    { key: 'credit', label: t('common.credit'), render: (v: number) => v ? formatCurrency(v) : '-' },
    { key: 'running_balance', label: t('common.balance'), render: (v: number) => formatCurrency(v) },
  ];

  return (
    <div>
      <PageHeader title={t('account_statement.title')} subtitle={t('account_statement.subtitle')} actions={<PrintButton />} />

      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.type')}</label>
            <div className="flex gap-2">
              <button onClick={() => { setMode('client'); setSelectedId(''); setData(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'client' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <User className="w-4 h-4 inline ml-1" />{t('common.client')}
              </button>
              <button onClick={() => { setMode('supplier'); setSelectedId(''); setData(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'supplier' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <Building2 className="w-4 h-4 inline ml-1" />{t('common.supplier')}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{mode === 'client' ? t('common.client') : t('common.supplier')}</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="input-field">
              <option value="">{t('common.select')}</option>
              {(mode === 'client' ? clients : suppliers).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.from')}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.to')}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" />
          </div>
          <button onClick={loadStatement} disabled={!selectedId} className="btn-primary">
            <FileText className="w-4 h-4 inline ml-1" />{t('common.view')}
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <span className="stat-label">{t('common.name')}</span>
              <span className="stat-value">{mode === 'client' ? data.client?.name : data.supplier?.name}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('common.phone')}</span>
              <span className="stat-value">{mode === 'client' ? data.client?.phone : data.supplier?.phone}</span>
            </div>
            <div className={`stat-card ${data.current_balance >= 0 ? 'stat-card-success' : 'stat-card-danger'}`}>
              <span className="stat-label">{t('common.balance')}</span>
              <span className="stat-value">{formatCurrency(data.current_balance)}</span>
            </div>
          </div>

          <DataTable columns={columns} data={data.transactions || []} loading={loading} />
        </>
      )}
    </div>
  );
}
