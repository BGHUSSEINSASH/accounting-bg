import { useState, useEffect } from 'react';
import { Database, Download, Trash2, RotateCcw, Plus } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { formatDateTime } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

interface Backup {
  id: number;
  filename: string;
  size: number;
  created_at: string;
  created_by_name: string;
}

export default function BackupPage() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/backups');
      setBackups(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.post('/backups');
      toast.success(t('backup.create_success'));
      fetchBackups();
    } catch {
      toast.error(t('error.save'));
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await api.post(`/backups/${restoreTarget.id}/restore`);
      toast.success(t('backup.restore_success'));
      setShowRestoreModal(false);
      setRestoreTarget(null);
    } catch {
      toast.error(t('backup.restore_failed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/backups/${deleteTarget.id}`);
      toast.success(t('backup.delete_success'));
      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchBackups();
    } catch {
      toast.error(t('backup.delete_failed'));
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('backup.title') }]} />
      <PageHeader title={t('backup.title')} subtitle={t('backup.subtitle')} actions={
        <><button onClick={handleCreate} disabled={creating} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {creating ? t('backup.creating') : t('backup.create')}
        </button><PrintButton /></>
      } />

      <DataTable
        columns={[
          { key: 'filename', label: t('backup.filename') },
          { key: 'size', label: t('backup.size'), render: (v) => formatSize(v) },
          { key: 'created_at', label: t('backup.created_at'), render: (v) => v ? formatDateTime(v) : '-' },
          { key: 'created_by_name', label: t('backup.created_by') },
          { key: 'actions', label: '', render: (_, row: Backup) => (
            <div className="flex gap-2">
              <button onClick={() => { setRestoreTarget(row); setShowRestoreModal(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600" title={t('backup.restore_button')}>
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => { setDeleteTarget(row); setShowDeleteModal(true); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title={t('common.delete')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )},
        ]}
        data={backups}
        loading={loading}
      />

      <Modal isOpen={showRestoreModal} onClose={() => setShowRestoreModal(false)} title={t('backup.restore_confirm')} size="sm">
        <p className="text-gray-600 mb-4">{t('backup.restore_confirm_message')} <strong>{restoreTarget?.filename}</strong></p>
        <p className="text-red-500 text-sm mb-4">{t('backup.restore_warning')}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setShowRestoreModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
          <button onClick={handleRestore} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">{t('backup.restore_button')}</button>
        </div>
      </Modal>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title={t('backup.delete_confirm')} size="sm">
        <p className="text-gray-600 mb-4">{t('backup.delete_confirm_message')} <strong>{deleteTarget?.filename}</strong></p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
          <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">{t('backup.delete_button')}</button>
        </div>
      </Modal>
    </div>
  );
}
