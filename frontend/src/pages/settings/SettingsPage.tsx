import { useState, useEffect } from 'react';
import { Building2, Globe, DollarSign, Save, Plus, Pencil, Trash2, Settings as SettingsIcon, Shield, Bell, Printer, Calculator, Percent, RefreshCw, Database } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';
import { getCurrencySymbol } from '../../store/appStore';

const CURRENCY_OPTIONS = ['IQD', 'SAR', 'USD', 'EUR', 'GBP', 'AED', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR'];

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: number;
  is_active: number;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>('company');
  const [company, setCompany] = useState({ name: '', name_en: '', phone: '', email: '', address: '', website: '', tax_number: '', commercial_registry: '', cr_number: '' });
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [editCurrency, setEditCurrency] = useState<Currency | null>(null);
  const [currencyForm, setCurrencyForm] = useState({ code: '', name: '', symbol: '', exchange_rate: 1, is_base: false });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const { t, setLang } = useTranslation();

  useEffect(() => {
    Promise.all([
      api.get('/settings/company'),
      api.get('/settings/currencies'),
      api.get('/settings'),
    ]).then(([c, cur, s]) => {
      setCompany(c.data);
      setCurrencies(cur.data);
      setSettings(s.data);
    }).catch(() => toast.error(t('error.load')))
    .finally(() => setLoading(false));
  }, []);

  const saveCompany = async () => {
    try { await api.put('/settings/company', company); toast.success(t('common.save')); }
    catch { toast.error(t('error.save')); }
  };

  const saveSettings = async (extra?: Record<string, string>) => {
    try {
      const data = { ...settings, ...extra };
      await api.put('/settings', data);
      toast.success(t('common.save'));
    } catch { toast.error(t('error.save')); }
  };

  const saveCurrency = async () => {
    try {
      if (editCurrency) { await api.put(`/settings/currencies/${editCurrency.id}`, currencyForm); }
      else { await api.post('/settings/currencies', currencyForm); }
      setShowCurrencyModal(false); setEditCurrency(null);
      const { data } = await api.get('/settings/currencies'); setCurrencies(data);
      toast.success(t('common.save'));
    } catch { toast.error(t('error.save')); }
  };

  const deleteCurrency = async (id: number) => {
    try { await api.delete(`/settings/currencies/${id}`); const { data } = await api.get('/settings/currencies'); setCurrencies(data); setConfirmDelete(null); }
    catch { toast.error(t('error.delete')); }
  };

  const tabs = [
    { key: 'company', label: 'معلومات الشركة', icon: Building2 },
    { key: 'vat', label: 'إعدادات الضريبة (VAT)', icon: Percent },
    { key: 'fiscal', label: 'السنة المالية', icon: Calculator },
    { key: 'inventory', label: 'إعدادات المخزون', icon: Database },
    { key: 'invoice', label: 'قوالب الفواتير', icon: Printer },
    { key: 'currencies', label: 'العملات', icon: DollarSign },
    { key: 'general', label: 'الإعدادات العامة', icon: SettingsIcon },
    { key: 'notifications', label: 'الإشعارات', icon: Bell },
    { key: 'backup', label: 'النسخ الاحتياطي', icon: RefreshCw },
    { key: 'security', label: 'الأمان', icon: Shield },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'الإعدادات' }]} />
      <PageHeader title="الإعدادات" />

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.key ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* معلومات الشركة */}
      {activeTab === 'company' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Building2 className="w-5 h-5" /> معلومات الشركة</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">اسم الشركة (عربي) *</label><input className="input-field" value={company.name} onChange={e => setCompany({...company, name: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">اسم الشركة (إنجليزي)</label><input className="input-field" value={company.name_en} onChange={e => setCompany({...company, name_en: e.target.value})} /></div>
            <div><label className="label">رقم الهاتف</label><input className="input-field" value={company.phone} onChange={e => setCompany({...company, phone: e.target.value})} /></div>
            <div><label className="label">البريد الإلكتروني</label><input className="input-field" type="email" value={company.email} onChange={e => setCompany({...company, email: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">العنوان</label><input className="input-field" value={company.address} onChange={e => setCompany({...company, address: e.target.value})} /></div>
            <div><label className="label">الموقع الإلكتروني</label><input className="input-field" value={company.website} onChange={e => setCompany({...company, website: e.target.value})} /></div>
            <div><label className="label">الرقم الضريبي</label><input className="input-field" value={company.tax_number} onChange={e => setCompany({...company, tax_number: e.target.value})} /></div>
            <div><label className="label">السجل التجاري</label><input className="input-field" value={company.commercial_registry} onChange={e => setCompany({...company, commercial_registry: e.target.value})} /></div>
            <div><label className="label">رقم السجل التجاري</label><input className="input-field" value={company.cr_number} onChange={e => setCompany({...company, cr_number: e.target.value})} /></div>
          </div>
          <button onClick={saveCompany} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ معلومات الشركة</button>
        </div>
      )}

      {/* إعدادات الضريبة */}
      {activeTab === 'vat' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Percent className="w-5 h-5" /> إعدادات الضريبة (VAT)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">تفعيل ضريبة القيمة المضافة</p>
                <p className="text-sm text-gray-500">تطبيق VAT على جميع الفواتير</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={settings.vat_enabled === '1'} onChange={e => setSettings({...settings, vat_enabled: e.target.checked ? '1' : '0'})} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
            <div><label className="label">نسبة الضريبة (%)</label>
              <input type="number" className="input-field" min="0" max="100" step="0.1" value={settings.vat_percentage || '15'} onChange={e => setSettings({...settings, vat_percentage: e.target.value})} /></div>
            <div><label className="label">رقم التسجيل الضريبي</label>
              <input className="input-field" value={settings.vat_number || ''} onChange={e => setSettings({...settings, vat_number: e.target.value})} placeholder="300000000000003" /></div>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
              <strong>ملاحظة:</strong> عند تفعيل الضريبة، سيتم إضافة {settings.vat_percentage || 15}% تلقائياً لجميع الفواتير الجديدة
            </div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ إعدادات الضريبة</button>
        </div>
      )}

      {/* السنة المالية */}
      {activeTab === 'fiscal' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Calculator className="w-5 h-5" /> إعدادات السنة المالية</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">بداية السنة المالية</label>
                <select className="input-field" value={settings.fiscal_year_start || '01-01'} onChange={e => setSettings({...settings, fiscal_year_start: e.target.value})}>
                  {['01-01','02-01','03-01','04-01','07-01','10-01'].map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>
              <div><label className="label">نهاية السنة المالية</label>
                <select className="input-field" value={settings.fiscal_year_end || '12-31'} onChange={e => setSettings({...settings, fiscal_year_end: e.target.value})}>
                  {['12-31','01-31','03-31','06-30','09-30'].map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-700">
              السنة المالية الحالية: {settings.fiscal_year_start || '01-01'} إلى {settings.fiscal_year_end || '12-31'}
            </div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ السنة المالية</button>
        </div>
      )}

      {/* إعدادات المخزون */}
      {activeTab === 'inventory' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Database className="w-5 h-5" /> إعدادات المخزون</h3>
          <div className="space-y-4">
            <div>
              <label className="label">طريقة احتساب تكلفة المخزون</label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {[{key:'fifo',name:'FIFO',desc:'الوارد أولاً يصرف أولاً'},{key:'avco',name:'AVCO',desc:'المتوسط المرجح'}].map(m => (
                  <label key={m.key} className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${settings.inventory_method === m.key ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" className="sr-only" value={m.key} checked={settings.inventory_method === m.key} onChange={() => setSettings({...settings, inventory_method: m.key})} />
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.desc}</p>
                  </label>
                ))}
              </div>
            </div>
            <div><label className="label">عدد الأيام للتنبيه بانتهاء الصلاحية</label>
              <input type="number" className="input-field" min="1" max="365" value={settings.expiry_notify_days || '30'} onChange={e => setSettings({...settings, expiry_notify_days: e.target.value})} /></div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div><p className="font-medium">تنبيه المخزون المنخفض</p><p className="text-sm text-gray-500">إشعار عند الوصول للحد الأدنى</p></div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={settings.low_stock_notify === '1'} onChange={e => setSettings({...settings, low_stock_notify: e.target.checked ? '1' : '0'})} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
            <div><label className="label">عدد الأماكن العشرية</label>
              <select className="input-field" value={settings.decimal_places || '2'} onChange={e => setSettings({...settings, decimal_places: e.target.value})}>
                <option value="0">0</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
              </select></div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ إعدادات المخزون</button>
        </div>
      )}

      {/* قوالب الفواتير */}
      {activeTab === 'invoice' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Printer className="w-5 h-5" /> إعدادات الطباعة والفواتير</h3>
          <div className="space-y-4">
            <div>
              <label className="label">قالب الفاتورة</label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[{key:'default',name:'الافتراضي'},{key:'modern',name:'حديث'},{key:'minimal',name:'مبسط'}].map(tmpl => (
                  <label key={tmpl.key} className={`p-3 rounded-lg border-2 text-center cursor-pointer transition-colors ${settings.invoice_template === tmpl.key ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" className="sr-only" value={tmpl.key} checked={settings.invoice_template === tmpl.key} onChange={() => setSettings({...settings, invoice_template: tmpl.key})} />
                    <div className="text-2xl mb-1">📄</div>
                    <p className="text-sm font-medium">{tmpl.name}</p>
                  </label>
                ))}
              </div>
            </div>
            <div><label className="label">ملاحظات الفاتورة (تظهر أسفل كل فاتورة)</label>
              <textarea className="input-field" rows={3} value={settings.invoice_notes || ''} onChange={e => setSettings({...settings, invoice_notes: e.target.value})} placeholder="شكراً لتعاملكم معنا..." /></div>
            <div><label className="label">رمز العملة</label>
              <input className="input-field" value={settings.currency_symbol || getCurrencySymbol()} onChange={e => setSettings({...settings, currency_symbol: e.target.value})} /></div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ إعدادات الطباعة</button>
        </div>
      )}

      {/* العملات */}
      {activeTab === 'currencies' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">إدارة العملات وأسعار الصرف</p>
            <button onClick={() => { setEditCurrency(null); setCurrencyForm({ code: '', name: '', symbol: '', exchange_rate: 1, is_base: false }); setShowCurrencyModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> إضافة عملة</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-gray-50 text-sm text-gray-500">
                <th className="text-right p-3">الكود</th><th className="text-right p-3">الاسم</th><th className="text-right p-3">الرمز</th>
                <th className="text-right p-3">سعر الصرف</th><th className="text-right p-3">الحالة</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {currencies.map(cur => (
                  <tr key={cur.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium">{cur.code}</td>
                    <td className="p-3">{cur.name}</td>
                    <td className="p-3">{cur.symbol}</td>
                    <td className="p-3">{cur.exchange_rate}</td>
                    <td className="p-3">{cur.is_base ? <span className="badge badge-success">العملة الأساسية</span> : <span className="badge badge-info">فعّال</span>}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditCurrency(cur); setCurrencyForm({ code: cur.code, name: cur.name, symbol: cur.symbol, exchange_rate: cur.exchange_rate, is_base: !!cur.is_base }); setShowCurrencyModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => setConfirmDelete(cur.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* الإعدادات العامة */}
      {activeTab === 'general' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Globe className="w-5 h-5" /> الإعدادات العامة</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">العملة الافتراضية</label>
              <select className="input-field" value={settings.default_currency || 'IQD'} onChange={e => setSettings({...settings, default_currency: e.target.value})}>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="label">تنسيق التاريخ</label>
              <select className="input-field" value={settings.date_format || 'YYYY-MM-DD'} onChange={e => setSettings({...settings, date_format: e.target.value})}>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select></div>
            <div><label className="label">اللغة</label>
              <select className="input-field" value={settings.language || 'ar'} onChange={e => { setSettings({...settings, language: e.target.value}); setLang(e.target.value as any); }}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
                <option value="ku">کوردی</option>
              </select></div>
            <div><label className="label">المنطقة الزمنية</label>
              <select className="input-field" value={settings.timezone || 'Asia/Riyadh'} onChange={e => setSettings({...settings, timezone: e.target.value})}>
                <option value="Asia/Riyadh">Asia/Riyadh (السعودية)</option>
                <option value="Asia/Dubai">Asia/Dubai (الإمارات)</option>
                <option value="Asia/Kuwait">Asia/Kuwait (الكويت)</option>
                <option value="Asia/Qatar">Asia/Qatar (قطر)</option>
                <option value="Asia/Bahrain">Asia/Bahrain (البحرين)</option>
                <option value="Asia/Muscat">Asia/Muscat (عُمان)</option>
                <option value="Africa/Cairo">Africa/Cairo (مصر)</option>
                <option value="Asia/Baghdad">Asia/Baghdad (العراق)</option>
              </select></div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ الإعدادات</button>
        </div>
      )}

      {/* الإشعارات */}
      {activeTab === 'notifications' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Bell className="w-5 h-5" /> إعدادات الإشعارات</h3>
          <div className="space-y-3">
            {[
              {key:'notif_low_stock', label:'تنبيه المخزون المنخفض', desc:'عند وصول المخزون للحد الأدنى'},
              {key:'notif_expiry', label:'تنبيه انتهاء الصلاحية', desc:'قبل انتهاء صلاحية المنتجات'},
              {key:'notif_overdue', label:'تنبيه المدفوعات المتأخرة', desc:'عند تأخر سداد الفواتير'},
              {key:'notif_new_sale', label:'إشعار فاتورة جديدة', desc:'عند إنشاء فاتورة مبيعات'},
              {key:'notif_leave_request', label:'طلب إجازة جديد', desc:'عند تقديم موظف طلب إجازة'},
              {key:'notif_payroll', label:'تذكير كشف الراتب', desc:'في بداية كل شهر'},
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm">{n.label}</p><p className="text-xs text-gray-500">{n.desc}</p></div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={(settings[n.key] || '1') === '1'} onChange={e => setSettings({...settings, [n.key]: e.target.checked ? '1' : '0'})} />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
            ))}
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ إعدادات الإشعارات</button>
        </div>
      )}

      {/* النسخ الاحتياطي */}
      {activeTab === 'backup' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><RefreshCw className="w-5 h-5" /> إعدادات النسخ الاحتياطي</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div><p className="font-medium">النسخ الاحتياطي التلقائي</p><p className="text-sm text-gray-500">حفظ نسخة احتياطية تلقائياً</p></div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={settings.auto_backup_enabled === '1'} onChange={e => setSettings({...settings, auto_backup_enabled: e.target.checked ? '1' : '0'})} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
            <div><label className="label">تكرار النسخ الاحتياطي</label>
              <select className="input-field" value={settings.auto_backup_interval || 'daily'} onChange={e => setSettings({...settings, auto_backup_interval: e.target.value})}>
                <option value="hourly">كل ساعة</option>
                <option value="daily">يومياً</option>
                <option value="weekly">أسبوعياً</option>
                <option value="monthly">شهرياً</option>
              </select></div>
            <div className="pt-2">
              <button onClick={async () => { try { await api.post('/backups'); toast.success('تم إنشاء نسخة احتياطية'); } catch { toast.error('فشل إنشاء النسخة'); }}} className="btn-primary flex items-center gap-2">
                <Database className="w-4 h-4" /> إنشاء نسخة احتياطية الآن
              </button>
            </div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-4 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ الإعدادات</button>
        </div>
      )}

      {/* الأمان */}
      {activeTab === 'security' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5" /> إعدادات الأمان</h3>
          <div className="space-y-4">
            <div><label className="label">مدة انتهاء الجلسة (بالدقائق)</label>
              <input type="number" className="input-field" min="5" max="1440" value={settings.session_timeout || '60'} onChange={e => setSettings({...settings, session_timeout: e.target.value})} /></div>
            <div><label className="label">الحد الأقصى لمحاولات تسجيل الدخول</label>
              <input type="number" className="input-field" min="3" max="20" value={settings.max_login_attempts || '5'} onChange={e => setSettings({...settings, max_login_attempts: e.target.value})} /></div>
            <div><label className="label">مدة الإغلاق عند تجاوز المحاولات (بالدقائق)</label>
              <input type="number" className="input-field" min="1" max="60" value={settings.lockout_duration || '15'} onChange={e => setSettings({...settings, lockout_duration: e.target.value})} /></div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div><p className="font-medium">تسجيل سجل النشاط</p><p className="text-sm text-gray-500">تتبع جميع العمليات</p></div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={(settings.activity_log || '1') === '1'} onChange={e => setSettings({...settings, activity_log: e.target.checked ? '1' : '0'})} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </div>
          <button onClick={() => saveSettings()} className="btn-primary mt-6 flex items-center gap-2"><Save className="w-4 h-4" /> حفظ إعدادات الأمان</button>
        </div>
      )}

      <Modal isOpen={showCurrencyModal} onClose={() => setShowCurrencyModal(false)} title={editCurrency ? 'تعديل عملة' : 'إضافة عملة'}>
        <div className="space-y-4">
          <div><label className="label">كود العملة (مثل: USD)</label><input className="input-field" value={currencyForm.code} onChange={e => setCurrencyForm({...currencyForm, code: e.target.value.toUpperCase()})} /></div>
          <div><label className="label">اسم العملة</label><input className="input-field" value={currencyForm.name} onChange={e => setCurrencyForm({...currencyForm, name: e.target.value})} /></div>
          <div><label className="label">الرمز</label><input className="input-field" value={currencyForm.symbol} onChange={e => setCurrencyForm({...currencyForm, symbol: e.target.value})} /></div>
          <div><label className="label">سعر الصرف مقابل العملة الأساسية</label><input type="number" step="0.0001" className="input-field" value={currencyForm.exchange_rate} onChange={e => setCurrencyForm({...currencyForm, exchange_rate: parseFloat(e.target.value) || 1})} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={currencyForm.is_base} onChange={e => setCurrencyForm({...currencyForm, is_base: e.target.checked})} /> عملة أساسية</label>
          <div className="flex gap-3 justify-end mt-2">
            <button onClick={() => setShowCurrencyModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">إلغاء</button>
            <button onClick={saveCurrency} className="btn-primary">حفظ</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!confirmDelete} onConfirm={() => deleteCurrency(confirmDelete!)} onCancel={() => setConfirmDelete(null)} message="هل تريد حذف هذه العملة؟" />
    </div>
  );
}
  const [company, setCompany] = useState({ name: '', name_en: '', phone: '', email: '', address: '', website: '', tax_number: '', commercial_registry: '', cr_number: '' });
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [editCurrency, setEditCurrency] = useState<Currency | null>(null);
  const [currencyForm, setCurrencyForm] = useState({ code: '', name: '', symbol: '', exchange_rate: 1, is_base: false });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const { t, setLang } = useTranslation();

  useEffect(() => {
    Promise.all([
      api.get('/settings/company'),
      api.get('/settings/currencies'),
      api.get('/settings'),
    ]).then(([c, cur, s]) => {
      setCompany(c.data);
      setCurrencies(cur.data);
      setSettings(s.data);
    }).catch(() => toast.error(t('error.load')))
    .finally(() => setLoading(false));
  }, []);

  const saveCompany = async () => {
    try {
      await api.put('/settings/company', company);
      toast.success(t('common.save'));
    } catch { toast.error(t('error.save')); }
  };

  const saveSettings = async () => {
    try {
      await api.put('/settings', {
        date_format: settings.date_format || 'YYYY-MM-DD',
        language: settings.language || 'ar',
        timezone: settings.timezone || 'Asia/Riyadh',
      });
      toast.success(t('common.save'));
    } catch { toast.error(t('error.save')); }
  };

  const handleCurrencyChange = async (value: string) => {
    setSettings({...settings, default_currency: value});
  };
