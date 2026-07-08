import { useState, useEffect } from 'react';
import { Filter, X, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

interface ActivityLog {
  id: number;
  timestamp: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: number;
  details: string;
  ip_address: string;
}

interface SimpleUser {
  id: number;
  full_name: string;
  username: string;
}

export default function ActivityLogPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userId, setUserId] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (userId) params.user_id = userId;
      if (actionFilter) params.action = actionFilter;
      const { data } = await api.get('/activity-log', { params });
      setLogs(data.data || data);
      setTotal(data.total || data.length || 0);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page]);

  useEffect(() => {
    api.get('/auth/users').then(({ data }) => setUsers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setUserId('');
    setActionFilter('');
    setPage(1);
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('activity_log.title') }]} />
      <PageHeader title={t('activity_log.title')} subtitle={t('activity_log.subtitle')} actions={<PrintButton />} />

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('activity_log.from_date')}</label>
            <input type="date" className="input-field" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('activity_log.to_date')}</label>
            <input type="date" className="input-field" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('activity_log.user')}</label>
            <select className="input-field" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('activity_log.action_type')}</label>
            <input className="input-field" placeholder={t('common.search')} value={actionFilter} onChange={e => setActionFilter(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSearch} className="btn-primary flex items-center gap-1"><Search className="w-4 h-4" /> {t('common.search')}</button>
            <button onClick={clearFilters} className="btn-secondary flex items-center gap-1"><X className="w-4 h-4" /> {t('common.filter')}</button>
          </div>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'timestamp', label: t('activity_log.timestamp'), render: (v) => v ? new Date(v).toLocaleString('ar-SA') : '-' },
          { key: 'user_name', label: t('activity_log.user_name') },
          { key: 'action', label: t('activity_log.action') },
          { key: 'entity_type', label: t('activity_log.entity_type') },
          { key: 'entity_id', label: t('activity_log.entity_id') },
          { key: 'details', label: t('activity_log.details') },
          { key: 'ip_address', label: t('activity_log.ip') },
        ]}
        data={logs}
        loading={loading}
        page={page}
        total={total}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
