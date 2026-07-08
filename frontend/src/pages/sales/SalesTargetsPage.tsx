import { useState, useEffect } from 'react';
import { Target, TrendingUp, Plus, Trash2, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/format';

export default function SalesTargetsPage() {
  const [activeTab, setActiveTab] = useState<'targets' | 'commissions' | 'rules'>('targets');
  const [targets, setTargets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [form, setForm] = useState({ user_id: '', period_type: 'monthly', month: currentDate.getMonth() + 1, year: currentDate.getFullYear(), target_amount: '', target_count: '', notes: '' });
  const [ruleForm, setRuleForm] = useState({ user_id: '', rule_type: 'percentage', percentage: '', fixed_amount: '', min_sales: '' });

  useEffect(() => { fetchData(); }, [month, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [targetsRes, summaryRes, commissionsRes, rulesRes, empRes] = await Promise.all([
        api.get(`/sales-targets?year=${year}&month=${month}`),
        api.get(`/sales-targets/summary?year=${year}&month=${month}`),
        api.get(`/sales-targets/commissions?year=${year}&month=${month}`),
        api.get('/sales-targets/commissions/rules'),
        api.get('/hr/employees'),
      ]);
      setTargets(targetsRes.data);
      setSummary(summaryRes.data);
      setCommissions(commissionsRes.data);
      setRules(rulesRes.data);
      setEmployees(empRes.data?.employees || empRes.data || []);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  const saveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/sales-targets', { ...form, target_amount: parseFloat(form.target_amount), target_count: parseInt(form.target_count) || 0 });
      toast.success('تم حفظ الهدف');
      setShowModal(false);
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحفظ'); }
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/sales-targets/commissions/rules', { ...ruleForm, percentage: parseFloat(ruleForm.percentage) || 0, fixed_amount: parseFloat(ruleForm.fixed_amount) || 0, min_sales: parseFloat(ruleForm.min_sales) || 0 });
      toast.success('تم حفظ القاعدة');
      setShowRuleModal(false);
      fetchData();
    } catch { toast.error('فشل الحفظ'); }
  };

  const calculateCommissions = async () => {
    try {
      const res = await api.post('/sales-targets/commissions/calculate', { month, year });
      toast.success(res.data.message);
      fetchData();
    } catch { toast.error('فشل احتساب العمولات'); }
  };

  const deleteTarget = async (id: number) => {
    try { await api.delete(`/sales-targets/${id}`); fetchData(); } catch { toast.error('فشل الحذف'); }
  };

  return (
    <div>
      <PageHeader title="أهداف المبيعات والعمولات" actions={
        <div className="flex gap-2">
          <select className="input-field text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(2024, i).toLocaleDateString('ar', {month:'long'})}</option>)}
          </select>
          <select className="input-field text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[currentDate.getFullYear()-1, currentDate.getFullYear(), currentDate.getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      } />

      {/* ملخص الأداء */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {summary.slice(0, 3).map((rep: any) => (
          <div key={rep.id} className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">{rep.full_name?.charAt(0)}</div>
              <div><p className="font-medium">{rep.full_name}</p><p className="text-xs text-gray-500">{rep.department}</p></div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>الهدف</span><span className="font-medium">{formatCurrency(rep.target_amount)}</span></div>
              <div className="flex justify-between text-sm"><span>المحقق</span><span className="font-medium text-green-600">{formatCurrency(rep.achieved_amount)}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-primary-600 h-2 rounded-full transition-all" style={{width: `${Math.min(rep.achievement_pct || 0, 100)}%`}} />
              </div>
              <p className="text-xs text-gray-500 text-left">{rep.achievement_pct?.toFixed(1) || 0}% من الهدف</p>
            </div>
          </div>
        ))}
      </div>

      {/* التبويبات */}
      <div className="flex gap-4 mb-4 border-b">
        {[{key:'targets',label:'الأهداف',icon:Target},{key:'commissions',label:'العمولات',icon:Award},{key:'rules',label:'قواعد العمولات',icon:TrendingUp}].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'targets' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> تحديد هدف</button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 text-sm text-gray-600">
                <th className="text-right p-3">الموظف</th><th className="text-right p-3">الفترة</th><th className="text-right p-3">الهدف</th>
                <th className="text-right p-3">المحقق</th><th className="text-right p-3">النسبة</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="text-center p-8 text-gray-400">جاري التحميل...</td></tr> :
                targets.length === 0 ? <tr><td colSpan={6} className="text-center p-8 text-gray-400">لا توجد أهداف</td></tr> :
                targets.map((t: any) => {
                  const achieved = t.actual_amount || 0;
                  const pct = t.target_amount > 0 ? (achieved / t.target_amount * 100).toFixed(1) : 0;
                  return (
                    <tr key={t.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{t.full_name}</td>
                      <td className="p-3 text-gray-500">{t.period_type === 'monthly' ? `شهر ${t.month}/${t.year}` : t.year}</td>
                      <td className="p-3">{formatCurrency(t.target_amount)}</td>
                      <td className="p-3 text-green-600">{formatCurrency(achieved)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-20"><div className="bg-primary-600 h-1.5 rounded-full" style={{width:`${Math.min(Number(pct),100)}%`}} /></div>
                          <span className={`text-xs font-medium ${Number(pct) >= 100 ? 'text-green-600' : Number(pct) >= 70 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
                        </div>
                      </td>
                      <td className="p-3"><button onClick={() => deleteTarget(t.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'commissions' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={calculateCommissions} className="btn-primary flex items-center gap-2"><Award className="w-4 h-4" /> احتساب عمولات الشهر</button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 text-sm text-gray-600">
                <th className="text-right p-3">الموظف</th><th className="text-right p-3">الشهر</th><th className="text-right p-3">النسبة</th>
                <th className="text-right p-3">قيمة العمولة</th><th className="text-right p-3">الحالة</th>
              </tr></thead>
              <tbody>
                {commissions.length === 0 ? <tr><td colSpan={5} className="text-center p-8 text-gray-400">لا توجد عمولات - اضغط احتساب العمولات</td></tr> :
                commissions.map((c: any) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{c.full_name}</td>
                    <td className="p-3">{c.month}/{c.year}</td>
                    <td className="p-3">{c.percentage}%</td>
                    <td className="p-3 text-green-600 font-medium">{formatCurrency(c.amount)}</td>
                    <td className="p-3"><span className={`badge ${c.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>{c.status === 'paid' ? 'مدفوع' : 'معلق'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowRuleModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> إضافة قاعدة</button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 text-sm text-gray-600">
                <th className="text-right p-3">الموظف</th><th className="text-right p-3">النوع</th><th className="text-right p-3">النسبة/القيمة</th><th className="text-right p-3">الحد الأدنى للمبيعات</th>
              </tr></thead>
              <tbody>
                {rules.length === 0 ? <tr><td colSpan={4} className="text-center p-8 text-gray-400">لا توجد قواعد</td></tr> :
                rules.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">{r.full_name || 'جميع المندوبين'}</td>
                    <td className="p-3">{r.rule_type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}</td>
                    <td className="p-3 font-medium">{r.rule_type === 'percentage' ? `${r.percentage}%` : formatCurrency(r.fixed_amount)}</td>
                    <td className="p-3">{formatCurrency(r.min_sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="تحديد هدف مبيعات">
        <form onSubmit={saveTarget} className="space-y-4">
          <div><label className="label">الموظف *</label>
            <select className="input-field" required value={form.user_id} onChange={e => setForm({...form, user_id: e.target.value})}>
              <option value="">اختر موظف...</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">نوع الفترة</label>
              <select className="input-field" value={form.period_type} onChange={e => setForm({...form, period_type: e.target.value})}>
                <option value="monthly">شهري</option><option value="quarterly">ربعي</option><option value="yearly">سنوي</option>
              </select></div>
            <div><label className="label">الشهر</label>
              <select className="input-field" value={form.month} onChange={e => setForm({...form, month: parseInt(e.target.value)})}>
                {[...Array(12)].map((_,i) => <option key={i+1} value={i+1}>{new Date(2024,i).toLocaleDateString('ar',{month:'long'})}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">السنة *</label><input type="number" className="input-field" required value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value)})} /></div>
            <div><label className="label">الهدف المالي *</label><input type="number" className="input-field" required value={form.target_amount} onChange={e => setForm({...form, target_amount: e.target.value})} /></div>
          </div>
          <div><label className="label">عدد الفواتير المستهدف</label><input type="number" className="input-field" value={form.target_count} onChange={e => setForm({...form, target_count: e.target.value})} /></div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">إلغاء</button>
            <button type="submit" className="btn-primary">حفظ الهدف</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} title="إضافة قاعدة عمولة">
        <form onSubmit={saveRule} className="space-y-4">
          <div><label className="label">الموظف (اتركه فارغاً للتطبيق على الجميع)</label>
            <select className="input-field" value={ruleForm.user_id} onChange={e => setRuleForm({...ruleForm, user_id: e.target.value})}>
              <option value="">جميع المندوبين</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select></div>
          <div><label className="label">نوع العمولة</label>
            <select className="input-field" value={ruleForm.rule_type} onChange={e => setRuleForm({...ruleForm, rule_type: e.target.value})}>
              <option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option>
            </select></div>
          {ruleForm.rule_type === 'percentage' ? (
            <div><label className="label">النسبة المئوية (%)</label><input type="number" step="0.1" className="input-field" value={ruleForm.percentage} onChange={e => setRuleForm({...ruleForm, percentage: e.target.value})} /></div>
          ) : (
            <div><label className="label">المبلغ الثابت</label><input type="number" className="input-field" value={ruleForm.fixed_amount} onChange={e => setRuleForm({...ruleForm, fixed_amount: e.target.value})} /></div>
          )}
          <div><label className="label">الحد الأدنى للمبيعات للتأهل</label><input type="number" className="input-field" value={ruleForm.min_sales} onChange={e => setRuleForm({...ruleForm, min_sales: e.target.value})} /></div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowRuleModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">إلغاء</button>
            <button type="submit" className="btn-primary">حفظ</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
