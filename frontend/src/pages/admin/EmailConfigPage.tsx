import { useState, useEffect } from 'react';
import { Save, Send, Eye, EyeOff, Mail } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  smtp_username: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
}

export default function EmailConfigPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<EmailConfig>({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: 0,
    smtp_username: '',
    smtp_password: '',
    from_name: '',
    from_email: '',
  });

  useEffect(() => {
    api.get('/email-config').then(({ data }) => {
      if (data) setForm(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/email-config', form);
      toast.success(t('common.save'));
    } catch {
      toast.error(t('error.save'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) { toast.error(t('email_config.test_email_required')); return; }
    setTesting(true);
    try {
      await api.post('/email-config/test', { test_email: testEmail });
      toast.success(t('email_config.test_success'));
      setShowTestModal(false);
      setTestEmail('');
    } catch {
      toast.error(t('email_config.test_failed'));
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="card p-6 text-center text-gray-500">{t('common.loading')}</div>;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('email_config.breadcrumb') }]} />
      <PageHeader title={t('email_config.title')} subtitle={t('email_config.subtitle')} actions={
        <><button onClick={() => setShowTestModal(true)} className="btn-secondary flex items-center gap-2"><Send className="w-4 h-4" /> {t('email_config.test')}</button><PrintButton /></>
      } />

      <div className="card p-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.smtp_host')}</label>
            <input className="input-field" dir="ltr" placeholder="smtp.example.com" value={form.smtp_host} onChange={e => setForm({...form, smtp_host: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.smtp_port')}</label>
            <input className="input-field" type="number" dir="ltr" placeholder="587" value={form.smtp_port} onChange={e => setForm({...form, smtp_port: parseInt(e.target.value) || 587})} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.smtp_secure} onChange={e => setForm({...form, smtp_secure: e.target.checked ? 1 : 0})} className="w-4 h-4 rounded border-gray-300 text-primary-600" />
              {t('email_config.secure')}
            </label>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.smtp_username')}</label>
            <input className="input-field" dir="ltr" value={form.smtp_username} onChange={e => setForm({...form, smtp_username: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.smtp_password')}</label>
            <div className="relative">
              <input className="input-field pl-10" dir="ltr" type={showPassword ? 'text' : 'password'} value={form.smtp_password} onChange={e => setForm({...form, smtp_password: e.target.value})} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.from_name')}</label>
            <input className="input-field" value={form.from_name} onChange={e => setForm({...form, from_name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('email_config.from_email')}</label>
            <input className="input-field" dir="ltr" placeholder="noreply@example.com" value={form.from_email} onChange={e => setForm({...form, from_email: e.target.value})} />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary mt-6 flex items-center gap-2">
          <Save className="w-4 h-4" /> {saving ? t('email_config.saving') : t('common.save')}
        </button>
      </div>

      <Modal isOpen={showTestModal} onClose={() => setShowTestModal(false)} title={t('email_config.test_title')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('email_config.test_description')}</p>
          <input className="input-field" dir="ltr" type="email" placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowTestModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleTest} disabled={testing} className="btn-primary flex items-center gap-2">
              <Send className="w-4 h-4" /> {testing ? t('email_config.sending') : t('email_config.send')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
