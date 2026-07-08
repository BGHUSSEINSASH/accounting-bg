import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

export default function PDFReportsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleExportSales = async () => {
    setLoading(true);
    try {
      const res = await api.get('/report-pdf/sales', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('common.export'));
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCustom = async () => {
    setLoading(true);
    try {
      const res = await api.post('/report-pdf/custom', {
        title: t('pdf_reports.custom_report'),
        columns: [t('pdf_reports.item'), t('pdf_reports.quantity'), t('pdf_reports.price'), t('pdf_reports.total')],
        data: [],
      }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('common.export'));
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('reports.title'), path: '/reports' }, { label: t('pdf_reports.title') }]} />
      <PageHeader title={t('pdf_reports.title')} subtitle={t('pdf_reports.subtitle')} actions={<PrintButton />} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">{t('pdf_reports.sales_invoice')}</h3>
              <p className="text-sm text-gray-500">{t('pdf_reports.sales_invoice_desc')}</p>
            </div>
          </div>
          <button onClick={handleExportSales} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> {loading ? t('common.loading') : t('pdf_reports.export')}
          </button>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-green-50 text-green-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">{t('pdf_reports.custom_report')}</h3>
              <p className="text-sm text-gray-500">{t('pdf_reports.custom_report_desc')}</p>
            </div>
          </div>
          <button onClick={handleExportCustom} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> {loading ? t('common.loading') : t('pdf_reports.export')}
          </button>
        </div>
      </div>
    </div>
  );
}
