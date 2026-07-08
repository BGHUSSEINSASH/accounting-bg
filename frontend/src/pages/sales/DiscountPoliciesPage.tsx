import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useTranslation } from '../../i18n/context';

export default function DiscountPoliciesPage() {
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', policy_type: 'total', client_classification_id: '', min_quantity: '', min_total: '', discount_percentage: '', start_date: '', end_date: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [pRes, cRes] = await Promise.all([api.get('/discount-policies'), api.get('/client-classifications')]);
      setPolicies(pRes.data);
      setClassifications(cRes.data || []);
    } catch { toast.error('فشل التحميل'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = { ...form, discount_percentage: parseFloat(form.discount_percentage), min_quantity: parseFloat(form.min_quantity) || 0, min_total: parseFloat(form.min_total) || 0, client_classification_id: form.client_classification_id ? parseInt(form.client_classification_id) : null };
      if (editing) await api.put(`/discount-policies/${editing.id}`, data);
      else await api.post('/discount-policies', data);
      toast.success('تم الحفظ');
      setShowModal(false); setEditing(null);
      setForm({ name: '', policy_type: 'total', client_classification_id: '', min_quantity: '', min_total: '', discount_percentage: '', start_date: '', end_date: '' });
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحفظ'); }
  };

  const handleEdit = (p: any) => {
    setEditing(p);
    setForm({ name: p.name, policy_type: p.policy_type, client_classification_id: p.client_classification_id || '', min_quantity: p.min_quantity || '', min_total: p.min_total || '', discount_percentage: p.discount_percentage, start_date: p.start_date || '', end_date: p.end_date || '' });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/discount-policies/${id}`); fetchData(); setConfirmDelete(null); }
    catch { toast.error('فشل الحذف'); }
  };

  const policyTypeLabel = (t: string) => ({total:'إجمالي الفاتورة', quantity:'الكمية', client_type:'نوع العميل', period:'فترة زمنية'}[t] || t);

  return (
    <div>
      <PageHeader title={t('discount_policies.title') || 'سياسات الخصم'} actions={
        <button onClick={() => { setEditing(null); setForm({ name: '', policy_type: 'total', client_classification_id: '', min_quantity: '', min_total: '', discount_percentage: '', start_date: '', end_date: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      } />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <div className="col-span-3 text-center p-8 text-gray-400">جاري التحميل...</div> :
        policies.length === 0 ? (
          <div className="col-span-3 text-center p-12 text-gray-400">
            <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">{t('common.no_data')}</p>
            <p className="text-sm mt-1">{t('discount_policies.empty') || 'أضف سياسات لتطبيق خصومات تلقائية على الفواتير'}</p>
          </div>
        ) :
        policies.map((p: any) => (
          <div key={p.id} className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold">{p.name}</h3>
                <span className="badge badge-info text-xs mt-1">{policyTypeLabel(p.policy_type)}</span>
              </div>
              <div className="text-2xl font-bold text-primary-600">{p.discount_percentage}%</div>
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              {p.min_total > 0 && <p>{t('discount_policies.min_total') || 'الحد الأدنى للفاتورة'}: {p.min_total} {t('common.currency_sar')}</p>}
              {p.min_quantity > 0 && <p>الحد الأدنى للكمية: {p.min_quantity}</p>}
              {p.classification_name && <p>لعملاء: {p.classification_name}</p>}
              {p.start_date && <p>من: {p.start_date} {p.end_date && `حتى: ${p.end_date}`}</p>}
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t">
              <button onClick={() => handleEdit(p)} className="flex-1 text-sm text-blue-600 hover:bg-blue-50 py-1 rounded flex items-center justify-center gap-1"><Edit2 className="w-3 h-3" /> تعديل</button>
              <button onClick={() => setConfirmDelete(p.id)} className="flex-1 text-sm text-red-500 hover:bg-red-50 py-1 rounded flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> حذف</button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? (t('common.edit') || 'تعديل سياسة') : (t('common.add') || 'إضافة سياسة خصم')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">اسم السياسة *</label><input className="input-field" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="label">نوع السياسة</label>
            <select className="input-field" value={form.policy_type} onChange={e => setForm({...form, policy_type: e.target.value})}>
              <option value="total">حسب إجمالي الفاتورة</option>
              <option value="quantity">حسب الكمية</option>
              <option value="client_type">حسب نوع العميل</option>
              <option value="period">فترة زمنية</option>
            </select></div>
          <div><label className="label">نسبة الخصم (%) *</label><input type="number" step="0.1" min="0" max="100" className="input-field" required value={form.discount_percentage} onChange={e => setForm({...form, discount_percentage: e.target.value})} /></div>
          {form.policy_type === 'total' && <div><label className="label">الحد الأدنى لإجمالي الفاتورة</label><input type="number" className="input-field" value={form.min_total} onChange={e => setForm({...form, min_total: e.target.value})} /></div>}
          {form.policy_type === 'quantity' && <div><label className="label">الحد الأدنى للكمية</label><input type="number" className="input-field" value={form.min_quantity} onChange={e => setForm({...form, min_quantity: e.target.value})} /></div>}
          {form.policy_type === 'client_type' && <div><label className="label">فئة العميل</label>
            <select className="input-field" value={form.client_classification_id} onChange={e => setForm({...form, client_classification_id: e.target.value})}>
              <option value="">الكل</option>
              {classifications.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>}
          {(form.policy_type === 'period') && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">من تاريخ</label><input type="date" className="input-field" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} /></div>
              <div><label className="label">إلى تاريخ</label><input type="date" className="input-field" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} /></div>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!confirmDelete} onConfirm={() => handleDelete(confirmDelete!)} onCancel={() => setConfirmDelete(null)} message="هل تريد حذف هذه السياسة؟" />
    </div>
  );
}
