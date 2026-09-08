import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';
import {
  DollarSign, Users, TrendingUp, Calendar, Calculator,
  CheckCircle, CreditCard, FileText, Printer, RefreshCw,
  ChevronDown, Eye, Edit2, Trash2,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

// ─── Types ─────────────────────────────────────────────────────────────────
interface PayrollRecord {
  id: number;
  user_id: number;
  full_name: string;
  department: string;
  position: string;
  month: number;
  year: number;
  basic_salary: number;
  housing_allowance: number;
  transportation_allowance: number;
  other_allowances: number;
  overtime_amount: number;
  gross_salary: number;
  social_insurance: number;
  tax_deduction: number;
  loan_deduction: number;
  absence_deduction: number;
  other_deductions: number;
  net_salary: number;
  status: 'draft' | 'approved' | 'paid';
  payment_date: string | null;
  payment_method: string | null;
  notes: string | null;
}

interface CalcItem {
  employee_id: number;
  employee_name: string;
  basic_salary: number;
  housing_allowance: number;
  transportation_allowance: number;
  overtime: number;
  insurance_deduction: number;
  attendance_deductions: number;
  gross: number;
  total_deductions: number;
  net_salary: number;
}

// ─── Status Badge ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    draft: { label: 'مسودة', cls: 'bg-gray-100 text-gray-700' },
    approved: { label: 'معتمد', cls: 'bg-blue-100 text-blue-700' },
    paid: { label: 'مدفوع', cls: 'bg-green-100 text-green-700' },
  };
  const s = config[status] || config.draft;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

// ─── Payslip Print ─────────────────────────────────────────────────────────
function printPayslip(rec: PayrollRecord, companyName = 'شركتي') {
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
    <style>
      body{font-family:Arial,sans-serif;max-width:600px;margin:20px auto;font-size:13px}
      h2{text-align:center;border-bottom:2px solid #333;pb:8px}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      td,th{padding:6px 10px;border:1px solid #ddd}
      th{background:#f5f5f5;font-weight:bold}
      .total{background:#e8f4fd;font-weight:bold}
      .net{background:#d4edda;font-weight:bold;font-size:15px}
      .footer{text-align:center;margin-top:20px;font-size:11px;color:#666}
    </style></head><body>
    <h2>${companyName}</h2>
    <p style="text-align:center">قسيمة راتب — ${rec.month}/${rec.year}</p>
    <table>
      <tr><th colspan="2">بيانات الموظف</th></tr>
      <tr><td>الاسم</td><td>${rec.full_name}</td></tr>
      <tr><td>القسم</td><td>${rec.department || '—'}</td></tr>
      <tr><td>المسمى</td><td>${rec.position || '—'}</td></tr>
    </table>
    <table>
      <tr><th>الإضافات</th><th>المبلغ</th><th>الخصومات</th><th>المبلغ</th></tr>
      <tr><td>الراتب الأساسي</td><td>${formatCurrency(rec.basic_salary)}</td>
          <td>التأمين</td><td>${formatCurrency(rec.social_insurance)}</td></tr>
      <tr><td>بدل السكن</td><td>${formatCurrency(rec.housing_allowance)}</td>
          <td>ضريبة</td><td>${formatCurrency(rec.tax_deduction || 0)}</td></tr>
      <tr><td>بدل النقل</td><td>${formatCurrency(rec.transportation_allowance)}</td>
          <td>سلفة</td><td>${formatCurrency(rec.loan_deduction)}</td></tr>
      <tr><td>ساعات إضافية</td><td>${formatCurrency(rec.overtime_amount)}</td>
          <td>خصم غياب</td><td>${formatCurrency(rec.absence_deduction)}</td></tr>
      <tr class="total"><td>الإجمالي</td><td>${formatCurrency(rec.gross_salary)}</td>
          <td>إجمالي الخصومات</td>
          <td>${formatCurrency(rec.social_insurance + (rec.tax_deduction || 0) + rec.loan_deduction + rec.absence_deduction + (rec.other_deductions || 0))}</td></tr>
    </table>
    <table><tr class="net"><td>صافي الراتب</td><td>${formatCurrency(rec.net_salary)}</td></tr></table>
    ${rec.payment_date ? `<p>تاريخ الصرف: ${rec.payment_date}</p>` : ''}
    <div class="footer">هذه القسيمة صادرة إلكترونياً — ${new Date().toLocaleDateString('ar')}</div>
    <script>window.print();setTimeout(()=>window.close(),500)</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { t } = useTranslation();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRec, setSelectedRec] = useState<PayrollRecord | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ payment_date: now.toISOString().split('T')[0], payment_method: 'transfer' });
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/payroll?month=${selectedMonth}&year=${selectedYear}`);
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); } finally { setLoading(false); }
  };

  useEffect(() => { loadPayroll(); }, [selectedMonth, selectedYear]);

  // ─── Generate ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/payroll/generate', { month: selectedMonth, year: selectedYear });
      toast.success(data.message || 'تم توليد الرواتب');
      loadPayroll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل في توليد الرواتب');
    } finally { setGenerating(false); }
  };

  // ─── Approve ──────────────────────────────────────────────────────────
  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await api.post(`/payroll/${id}/approve`);
      toast.success('تم اعتماد الراتب');
      loadPayroll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الاعتماد'); }
    finally { setActionLoading(null); }
  };

  const handleApproveAll = async () => {
    const drafts = records.filter(r => r.status === 'draft');
    if (!drafts.length) { toast('لا توجد مسودات للاعتماد'); return; }
    setGenerating(true);
    let ok = 0;
    for (const r of drafts) {
      try { await api.post(`/payroll/${r.id}/approve`); ok++; } catch { /* skip */ }
    }
    toast.success(`تم اعتماد ${ok} راتب`);
    loadPayroll();
    setGenerating(false);
  };

  // ─── Pay ──────────────────────────────────────────────────────────────
  const openPayModal = (rec: PayrollRecord) => {
    setSelectedRec(rec);
    setPayForm({ payment_date: now.toISOString().split('T')[0], payment_method: 'transfer' });
    setShowPayModal(true);
  };

  const handlePay = async () => {
    if (!selectedRec) return;
    setActionLoading(selectedRec.id);
    try {
      await api.post(`/payroll/${selectedRec.id}/pay`, payForm);
      toast.success('تم تسجيل صرف الراتب');
      setShowPayModal(false);
      loadPayroll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الدفع'); }
    finally { setActionLoading(null); }
  };

  const handlePayAll = async () => {
    const approved = records.filter(r => r.status === 'approved');
    if (!approved.length) { toast('لا توجد رواتب معتمدة للصرف'); return; }
    setGenerating(true);
    let ok = 0;
    for (const r of approved) {
      try { await api.post(`/payroll/${r.id}/pay`, payForm); ok++; } catch { /* skip */ }
    }
    toast.success(`تم صرف ${ok} راتب`);
    loadPayroll();
    setGenerating(false);
  };

  // ─── Delete ───────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/payroll/${id}`);
      toast.success('تم الحذف');
      loadPayroll();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحذف'); }
  };

  // ─── Stats ────────────────────────────────────────────────────────────
  const totalNet = records.reduce((s, r) => s + r.net_salary, 0);
  const totalGross = records.reduce((s, r) => s + r.gross_salary, 0);
  const countDraft = records.filter(r => r.status === 'draft').length;
  const countApproved = records.filter(r => r.status === 'approved').length;
  const countPaid = records.filter(r => r.status === 'paid').length;

  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  if (loading) return <CardSkeleton count={3} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.payroll') }]} />
      <PageHeader
        title={t('payroll.title')}
        subtitle={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
        actions={<PrintButton />}
      />

      {/* Controls */}
      <div className="card p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <select className="input-field w-36" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input-field w-28" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleGenerate} disabled={generating}
            className="btn-primary flex items-center gap-2 px-4">
            <Calculator className="w-4 h-4" />
            {generating ? 'جاري الحساب...' : 'توليد/حساب الرواتب'}
          </button>
          {records.length > 0 && (
            <>
              {countDraft > 0 && (
                <button onClick={handleApproveAll} disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                  <CheckCircle className="w-4 h-4" /> اعتماد الكل ({countDraft})
                </button>
              )}
              {countApproved > 0 && (
                <button onClick={handlePayAll} disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors">
                  <CreditCard className="w-4 h-4" /> صرف الكل ({countApproved})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { l: 'إجمالي الموظفين', v: records.length, c: 'bg-gray-50 text-gray-800' },
            { l: 'إجمالي الرواتب', v: formatCurrency(totalGross), c: 'bg-blue-50 text-blue-800' },
            { l: 'صافي الرواتب', v: formatCurrency(totalNet), c: 'bg-green-50 text-green-800' },
            { l: 'مسودة', v: countDraft, c: 'bg-gray-50 text-gray-600' },
            { l: 'معتمد / مدفوع', v: `${countApproved} / ${countPaid}`, c: 'bg-emerald-50 text-emerald-800' },
          ].map(s => (
            <div key={s.l} className={`rounded-xl p-3 ${s.c}`}>
              <p className="text-xs opacity-70 mb-1">{s.l}</p>
              <p className="text-lg font-bold">{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {records.length === 0 ? (
        <div className="card p-12 text-center">
          <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">لم يتم توليد رواتب {monthNames[selectedMonth - 1]} {selectedYear} بعد</p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2 mx-auto">
            <Calculator className="w-4 h-4" /> توليد الرواتب الآن
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['الموظف', 'الأساسي', 'البدلات', 'الإضافي', 'الإجمالي', 'الخصومات', 'صافي', 'الحالة', 'إجراءات'].map(h => (
                    <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(rec => {
                  const totalAllowances = (rec.housing_allowance || 0) + (rec.transportation_allowance || 0) + (rec.other_allowances || 0);
                  const totalDeductions = (rec.social_insurance || 0) + (rec.tax_deduction || 0) + (rec.loan_deduction || 0) + (rec.absence_deduction || 0) + (rec.other_deductions || 0);
                  return (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-900 whitespace-nowrap">
                          <Link to="/hr/employees" className="hover:text-indigo-600 transition-colors">{rec.full_name}</Link>
                        </p>
                        <p className="text-xs text-gray-400">{rec.department}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm">{formatCurrency(rec.basic_salary)}</td>
                      <td className="px-3 py-2.5 font-mono text-sm text-blue-700">
                        {formatCurrency(totalAllowances)}
                        {totalAllowances > 0 && (
                          <div className="text-xs text-gray-400">
                            سكن:{formatCurrency(rec.housing_allowance)} نقل:{formatCurrency(rec.transportation_allowance)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm text-purple-700">{formatCurrency(rec.overtime_amount || 0)}</td>
                      <td className="px-3 py-2.5 font-mono text-sm font-semibold">{formatCurrency(rec.gross_salary)}</td>
                      <td className="px-3 py-2.5 font-mono text-sm text-red-600">
                        {formatCurrency(totalDeductions)}
                        {totalDeductions > 0 && (
                          <div className="text-xs text-gray-400">
                            تأمين:{formatCurrency(rec.social_insurance)}
                            {rec.loan_deduction > 0 && ` سلفة:${formatCurrency(rec.loan_deduction)}`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm font-bold text-green-700">{formatCurrency(rec.net_salary)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={rec.status} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {/* Approve */}
                          {rec.status === 'draft' && (
                            <button onClick={() => handleApprove(rec.id)}
                              disabled={actionLoading === rec.id}
                              title="اعتماد"
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {/* Pay */}
                          {rec.status === 'approved' && (
                            <button onClick={() => openPayModal(rec)}
                              title="صرف الراتب"
                              className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 transition-colors">
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          {/* Print payslip */}
                          <button onClick={() => printPayslip(rec)}
                            title="طباعة قسيمة"
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
                            <Printer className="w-4 h-4" />
                          </button>
                          {/* Delete (draft only) */}
                          {rec.status !== 'paid' && (
                            <button onClick={() => handleDelete(rec.id)}
                              title="حذف"
                              className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Footer totals */}
          <div className="bg-gray-50 border-t px-4 py-3 flex flex-wrap gap-6 text-sm">
            <span className="text-gray-500">إجمالي: <strong className="text-gray-800">{formatCurrency(totalGross)}</strong></span>
            <span className="text-gray-500">صافي: <strong className="text-green-700">{formatCurrency(totalNet)}</strong></span>
            <span className="text-gray-500">الموظفون: <strong className="text-gray-800">{records.length}</strong></span>
          </div>
        </div>
      )}

      {/* ─── Pay Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)}
        title={`صرف راتب — ${selectedRec?.full_name}`}>
        {selectedRec && (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">المبلغ المستحق</p>
              <p className="text-3xl font-bold text-green-700">{formatCurrency(selectedRec.net_salary)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الصرف</label>
              <input type="date" className="input-field" value={payForm.payment_date}
                onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الصرف</label>
              <select className="input-field" value={payForm.payment_method}
                onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                <option value="transfer">تحويل بنكي</option>
                <option value="cash">نقداً</option>
                <option value="check">شيك</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowPayModal(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">إلغاء</button>
              <button onClick={handlePay} disabled={actionLoading !== null}
                className="btn-primary px-6 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                تأكيد الصرف
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
