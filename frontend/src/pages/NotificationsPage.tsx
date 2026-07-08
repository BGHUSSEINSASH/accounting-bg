import { useState, useEffect, useCallback } from 'react';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, Trash2, CheckCheck, Mail, MailOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import PrintButton from '../components/ui/PrintButton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { authStore } from '../store/authStore';
import { useTranslation } from '../i18n/context';

const typeIcons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  info: { icon: <Info className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
  warning: { icon: <AlertTriangle className="w-5 h-5" />, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  success: { icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-600', bg: 'bg-green-50' },
  error: { icon: <XCircle className="w-5 h-5" />, color: 'text-red-600', bg: 'bg-red-50' },
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const user = authStore.getUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ user_id: String(user.id), page: String(page), limit: String(limit) });
      if (filter === 'unread') params.append('unread', 'true');
      const res = await api.get(`/notifications?${params}`);
      const data = res.data.notifications || res.data.data || res.data;
      setNotifications(Array.isArray(data) ? data : []);
      setTotal(res.data.total || 0);
    } catch { setNotifications([]); }
    finally { setLoading(false); }
  }, [user, page, filter]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get(`/notifications/unread-count?user_id=${user.id}`);
      setUnreadCount(res.data.count || 0);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetchNotifications();
      fetchUnreadCount();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      toast.success(t('notifications.mark_read'));
      fetchNotifications();
      fetchUnreadCount();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`);
      toast.success(t('notifications.delete'));
      fetchNotifications();
      fetchUnreadCount();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader title={t('notifications.title')} actions={<PrintButton />} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => { setFilter('all'); setPage(1); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{t('notifications.all')}</button>
            <button onClick={() => { setFilter('unread'); setPage(1); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'unread' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{t('notifications.unread')}</button>
          </div>
          {unreadCount > 0 && (
            <span className="badge badge-warning text-sm px-2.5 py-1">
              <Bell className="w-3.5 h-3.5 inline ml-1" />
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="btn-secondary text-sm flex items-center gap-1">
            <CheckCheck className="w-4 h-4" /> {t('notifications.mark_read')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('notifications.no_notifications')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n: any) => {
            const typeStyle = typeIcons[n.type] || typeIcons.info;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
                className={`card cursor-pointer transition-all hover:shadow-md ${!n.is_read ? 'border-r-4 border-r-blue-400 bg-blue-50/30' : ''}`}
              >
                <div className="flex gap-3 items-start">
                  <div className={`p-2 rounded-full ${typeStyle.bg} ${typeStyle.color} flex-shrink-0`}>
                    {typeStyle.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm">{n.title}</h4>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-gray-600 mb-1 line-clamp-2">{n.message}</p>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(n.created_at || n.createdAt), { addSuffix: true, locale: arSA })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.is_read && (
                      <button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-500 transition-colors" title={t('notifications.mark_as_read')}>
                        <MailOpen className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(n.id); }} className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors" title={t('common.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">{t('notifications.total')} {total}</p>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm">{page} {t('pagination.of')} {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('common.confirm_title')}
        message={t('notifications.confirm_delete')}
        variant="danger"
      />
    </div>
  );
}
