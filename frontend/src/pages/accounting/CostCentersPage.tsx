import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function CostCentersPage() {
  const [centers, setCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', parent_id: '' });

  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    setLoading(true);
    try {
      const res = await api.get('/cost-centers');
      setCenters(res.data || []);
    } catch {
      toast.error('فشل تحميل مراكز التكلفة');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      };
      if (editing) {
        await api.put(`/cost-centers/${editing.id}`, payload);
      } else {
        await api.post('/cost-centers', payload);
      }
      toast.success('تم الحفظ');
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', parent_id: '' });
      fetchCenters();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل الحفظ');
    }
  };

  const onEdit = (center: any) => {
    setEditing(center);
    setForm({
      name: center.name || '',
      parent_id: center.parent_id ? String(center.parent_id) : '',
    });
    setShowModal(true);
  };

  const onDelete = async (id: number) => {
    try {
      await api.delete(`/cost-centers/${id}`);
      toast.success('تم الحذف');
      setConfirmDelete(null);
      fetchCenters();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل الحذف');
    }
  };

  return (
    <div>
      <PageHeader
        title="مراكز التكلفة"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: '', parent_id: '' });
              setShowModal(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> إضافة مركز تكلفة
          </button>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-sm text-gray-600">
              <th className="table-header">الكود</th>
              <th className="table-header">الاسم</th>
              <th className="table-header">المركز الأب</th>
              <th className="table-header">الحالة</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">جاري التحميل...</td>
              </tr>
            ) : centers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="w-8 h-8" />
                    <span>لا توجد مراكز تكلفة</span>
                  </div>
                </td>
              </tr>
            ) : (
              centers.map((center) => (
                <tr key={center.id} className="border-t hover:bg-gray-50">
                  <td className="table-cell font-mono">{center.code}</td>
                  <td className="table-cell font-medium">{center.name}</td>
                  <td className="table-cell">{center.parent_name || '-'}</td>
                  <td className="table-cell">
                    <span className={`badge ${center.is_active ? 'badge-success' : 'badge-error'}`}>
                      {center.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(center)} className="p-1 hover:bg-gray-100 rounded">
                        <Edit2 className="w-4 h-4 text-blue-500" />
                      </button>
                      <button onClick={() => setConfirmDelete(center.id)} className="p-1 hover:bg-gray-100 rounded">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل مركز تكلفة' : 'إضافة مركز تكلفة'}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">الاسم *</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">المركز الأب</label>
            <select
              className="input-field"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">بدون</option>
              {centers.filter((c) => !editing || c.id !== editing.id).map((c) => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200">إلغاء</button>
            <button type="submit" className="btn-primary">حفظ</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onConfirm={() => onDelete(confirmDelete!)}
        onCancel={() => setConfirmDelete(null)}
        message="هل تريد حذف مركز التكلفة؟"
      />
    </div>
  );
}
