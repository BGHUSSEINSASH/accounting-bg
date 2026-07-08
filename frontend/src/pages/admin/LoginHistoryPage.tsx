import { useState, useEffect } from 'react';
import { Filter, X, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

interface LoginAttempt {
  id: number;
  username: string;
  full_name: string;
  attempted_at: string;
  ip_address: string;
  success: number;
}

interface SimpleUser {
  id: number;
  full_name: string;
  username: string;
}

export default function LoginHistoryPage() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userId, setUserId] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (userId) params.user_id = userId;
      const { data } = await api.get('/login-history', { params });
      setHistory(data.history || []);
      setTotal(data.total || 0);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [page]);

  useEffect(() => {
    api.get('/auth/users').then(({ data }) => setUsers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchHistory();
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setUserId('');
    setPage(1);
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('login_history.title') }]} />
      <PageHeader title={t('login_history.title')} subtitle={t('login_history.subtitle')} actions={<PrintButton />} />

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('login_history.from_date')}</label>
            <input type="date" className="input-field" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('login_history.to_date')}</label>
            <input type="date" className="input-field" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('login_history.user')}</label>
            <select className="input-field" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
          </div>
          <div />
          <div className="flex gap-2">
            <button onClick={handleSearch} className="btn-primary flex items-center gap-1"><Search className="w-4 h-4" /> {t('common.search')}</button>
            <button onClick={clearFilters} className="btn-secondary flex items-center gap-1"><X className="w-4 h-4" /> {t('common.filter')}</button>
          </div>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'username', label: t('login_history.username') },
          { key: 'full_name', label: t('login_history.user_name') },
          { key: 'attempted_at', label: t('login_history.time'), render: (v) => v ? new Date(v).toLocaleString('ar-SA') : '-' },
          { key: 'ip_address', label: t('login_history.ip') },
          { key: 'success', label: t('login_history.status'), render: (v) => v ? <span className="badge-success">{t('login_history.success')}</span> : <span className="badge-danger">{t('login_history.failed')}</span> },
        ]}
        data={history}
        loading={loading}
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
